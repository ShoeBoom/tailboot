// Run with Node against a built ISO; production code uses only browser APIs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { CONFIG_PLACEHOLDER, patchTailbootIso } from "../../tailboot-iso.ts";

const iso = process.argv[2];
assert.ok(iso, "Usage: node image/scripts/test-iso-patch.ts path/to/tailboot.iso byte-offset");
const configOffset = Number(process.argv[3]);
const workDir = await mkdtemp(join(tmpdir(), "tailboot-patch-"));

async function hashRange(path: string, start: number, end: number) {
  const hash = createHash("sha256");
  if (start <= end) {
    for await (const chunk of createReadStream(path, { start, end })) hash.update(chunk);
  }
  return hash.digest("hex");
}

try {
  const patched = join(workDir, "patched.iso");
  const config = {
    authKey: "tskey-auth-test-key",
    wifi: { ssid: 'Café "网络" 📶', password: ' spaces " \\ $() `secret` ' },
  };
  // An odd chunk size exercises a slot split across download chunks.
  const input = createReadStream(iso, { highWaterMark: 4093 })[Symbol.asyncIterator]();
  await patchTailbootIso({
    source: new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await input.next();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      async cancel() { await input.return?.(); },
    }),
    configOffset,
    config,
    destination: Writable.toWeb(createWriteStream(patched)),
  });

  const size = (await stat(iso)).size;
  assert.equal((await stat(patched)).size, size);
  for (const [start, end] of [
    [0, configOffset - 1],
    [configOffset + new TextEncoder().encode(CONFIG_PLACEHOLDER).length, size - 1],
  ]) {
    assert.equal(await hashRange(patched, start, end), await hashRange(iso, start, end));
  }

  const extracted = join(workDir, "TAILBOOT.JSON");
  execFileSync("xorriso", [
    "-abort_on", "FAILURE", "-osirrox", "on", "-indev", patched,
    "-extract", "/TAILBOOT.JSON", extracted,
  ], { stdio: "pipe" });
  assert.deepEqual(JSON.parse(await readFile(extracted, "utf8")), config);
  console.log(`Verified ISO patch at byte ${configOffset}: JSON round-trip, unchanged size and surrounding bytes.`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
