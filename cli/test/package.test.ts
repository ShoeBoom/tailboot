import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { CONFIG_PLACEHOLDER } from "../../tailboot-iso-core.ts";
import { metadata } from "../src/release.ts";

test("the installed npm package customizes an ISO locally", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tailboot-cli-"));
  try {
    const options = { encoding: "utf8", shell: process.platform === "win32" } as const;
    const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const packed = JSON.parse(execFileSync(pnpm, [
      "pack", "--json", "--pack-destination", directory,
    ], options));
    execFileSync(pnpm, [
      "--dir", directory, "add", "--ignore-scripts",
      packed.filename,
    ], options);
    const bin = join(directory, "node_modules/tailboot/dist/cli/src/index.js");
    assert.match(execFileSync(process.execPath, [bin, "--help"], options), /Usage: tailboot/);

    const configOffset = 32768;
    const iso = Buffer.concat([
      Buffer.alloc(configOffset, 7),
      Buffer.from(CONFIG_PLACEHOLDER),
      Buffer.from("ISO suffix"),
    ]);
    const input = join(directory, "base.iso");
    const output = join(directory, "custom.iso");
    const mock = join(directory, "fetch.mjs");
    await writeFile(input, iso);
    // Intercept the download in the child process to check the packaged metadata
    // and ensure credentials are never included in a network request.
    const url = `https://github.com/ShoeBoom/tailboot/releases/download/${encodeURIComponent(metadata.release)}/${encodeURIComponent(metadata.isoName)}`;
    await writeFile(mock, `
      import assert from "node:assert/strict";
      import { readFile } from "node:fs/promises";
      import { metadata } from ${JSON.stringify(new URL("release.js", pathToFileURL(bin)).href)};
      assert.deepEqual(metadata, ${JSON.stringify(metadata)});
      // Keep the synthetic ISO small even when the real slot is near its end.
      metadata.configOffset = ${configOffset};
      globalThis.fetch = async (...args) => {
        assert.deepEqual(args, [${JSON.stringify(url)}]);
        return new Response(await readFile(${JSON.stringify(input)}));
      };
    `);
    const args = ["--import", mock, bin, "test-auth-key", output,
      "--wifi-ssid", "Test Wi-Fi", "--wifi-password", "test-password"];
    execFileSync(process.execPath, args, options);
    const patched = await readFile(output);
    const end = configOffset + CONFIG_PLACEHOLDER.length;
    assert.equal(patched.length, iso.length);
    assert.deepEqual(patched.subarray(0, configOffset), iso.subarray(0, configOffset));
    assert.deepEqual(patched.subarray(end), iso.subarray(end));
    assert.deepEqual(JSON.parse(patched.subarray(configOffset, end).toString()), {
      authKey: "test-auth-key", wifi: { ssid: "Test Wi-Fi", password: "test-password" },
    });

    await rm(output);
    iso[configOffset] = 0;
    await writeFile(input, iso);
    const failed = spawnSync(process.execPath, args, options);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /configuration slot does not match/);
    await assert.rejects(readFile(output), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
