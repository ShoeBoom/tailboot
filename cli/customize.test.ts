import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { CONFIG_PLACEHOLDER } from "../tailboot-iso.ts";
import { customizeIso, isoUrl } from "./customize.ts";

const before = Buffer.from("ISO header\0");
const after = Buffer.from("\0ISO footer");
const bytes = Buffer.concat([before, Buffer.from(CONFIG_PLACEHOLDER), after]);
const release = {
  tag: "v2026.09.05.000000",
  isoName: "tailboot-v2026.09.05.000000-amd64.iso",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  configOffset: before.length,
};

test("pins the download to the embedded release and filename", () => {
  assert.equal(isoUrl(release),
    `https://github.com/ShoeBoom/tailboot/releases/download/${release.tag}/${release.isoName}`);
});

test("reuses the patcher in memory, preserving the base ISO and bytes outside the slot", async () => {
  const original = bytes.slice();
  for (const config of [
    { authKey: "" },
    { authKey: "any key without type checks" },
    { authKey: ' spaces " \\ ', wifi: { ssid: 'Café "网络" 📶', password: ' $() `secret` \\ ' } },
  ]) {
    const chunks = await customizeIso(bytes, release, config);
    const patched = Buffer.concat(chunks);
    assert.equal(patched.length, bytes.length);
    assert.deepEqual(patched.subarray(0, before.length), before);
    assert.deepEqual(patched.subarray(-after.length), after);
    assert.deepEqual(JSON.parse(patched.subarray(before.length, -after.length).toString()), config);
    assert.equal(chunks[0].buffer, bytes.buffer);
    assert.equal(chunks.at(-1)!.buffer, bytes.buffer);
    assert.deepEqual(bytes, original);
  }
});

test("rejects corrupted downloads before attempting the patch", async () => {
  const corrupted = Buffer.from(bytes);
  corrupted[0] ^= 1;
  await assert.rejects(customizeIso(corrupted, release, { authKey: "test" }), /SHA-256/);
  await assert.rejects(customizeIso(bytes.subarray(0, -1), release, { authKey: "test" }), /SHA-256/);
});

test("rejects incorrect offsets and oversized configurations without modifying input", async () => {
  const original = Buffer.from(bytes);
  for (const configOffset of [-1, 0, 0.5, bytes.length, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(customizeIso(bytes, { ...release, configOffset }, { authKey: "test" }), /slot|offset/);
  }
  await assert.rejects(customizeIso(bytes, release, { authKey: "é".repeat(4096) }), /exceeds/);
  assert.deepEqual(bytes, original);
});
