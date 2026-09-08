import assert from "node:assert/strict";
import test from "node:test";
import { generateTailcatKey, importTailcatKey, parseTailcatKey, tailcatAddress } from "./tailcat.ts";
import { validateTailbootConfig } from "./tailboot-config.ts";
import { CONFIG_PLACEHOLDER, patchTailbootIso } from "./tailboot-iso.ts";

// Public test fixture produced by upstream Tailcat v0.6.0 genkey --region=301.
const upstreamKey = {
  Private: "privkey:0096567c3b25baaa1d506d8bfd32384a38340ad897b3b5df4415fa41f66d0658",
  Public: {
    ServerPublic: "nodekey:6d5732ea08226462241c80d995d6ed761ce125e3db467ac8778d5386a1404551",
    ServerDiscoPublic: "discokey:a2f6c045cd0a025d6d0b5d22a6f997b1286dd016a6cd9b29ca4270f26454b447",
    PresharedKey: "psk:8992d045606350513be17a73c951bd8f68beab5bd8809dbf54f73f9d6922da17",
    RegionID: 301,
  },
};
const upstreamAddress = "tcpGFwWCBtVzLqCCJkYiQcgNmV1u12HOEl49tGesh3jVOGoUBFUWFrWCCi9sBFzQoCXW0LXSKm-ZexKG3QFqbNmynKQnDyZFS0R2FxWCCJktBFYGNQUTvhenPJUb2PaL6rW9iAnb9U9z-daSLaF2FpGQEt";

test("imports native Tailcat keys and reproduces the upstream address", () => {
  assert.deepEqual(importTailcatKey(JSON.stringify(upstreamKey)), upstreamKey);
  assert.equal(tailcatAddress(upstreamKey), upstreamAddress);
});

test("generates distinct valid identities and independent pre-shared keys", () => {
  const keys = Array.from({ length: 16 }, () => generateTailcatKey());
  for (const key of keys) assert.deepEqual(parseTailcatKey(key), key);
  assert.equal(new Set(keys.map((key) => key.Private)).size, keys.length);
  assert.equal(new Set(keys.map((key) => key.Public.PresharedKey)).size, keys.length);
  assert.equal(new Set(keys.map(tailcatAddress)).size, keys.length);
});

test("rejects passwords, addresses, incomplete keys, missing PSKs and unfixed regions", () => {
  for (const text of ["password123", upstreamAddress, '"remember-me"', "{}", "null"]) {
    assert.throws(() => importTailcatKey(text), /key|password/);
  }
  for (const change of [
    { PresharedKey: undefined }, { PresharedKey: "psk:" + "0".repeat(64) },
    { RegionID: -1 }, { RegionID: 0 }, { RegionID: 65536 },
    { ServerPublic: generateTailcatKey().Public.ServerPublic },
    { ServerDiscoPublic: generateTailcatKey().Public.ServerDiscoPublic },
    { Region: [{ Nodes: [] }] },
  ]) {
    assert.throws(() => parseTailcatKey({ ...upstreamKey, Public: { ...upstreamKey.Public, ...change } }));
  }
});

test("requires at least one route and round-trips each combination through an ISO", async () => {
  assert.throws(() => validateTailbootConfig({}), /Configure/);
  assert.throws(() => validateTailbootConfig({ authKey: "  " }), /Configure/);
  for (const config of [
    { authKey: "tskey-auth-test" },
    { tailcat: upstreamKey },
    { authKey: "tskey-auth-test", tailcat: upstreamKey },
  ]) {
    const chunks: Uint8Array[] = [];
    await patchTailbootIso({
      source: new Blob([CONFIG_PLACEHOLDER]), config, configOffset: 0,
      destination: new WritableStream({ write(chunk) { chunks.push(chunk); } }),
    });
    assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), config);
  }
});
