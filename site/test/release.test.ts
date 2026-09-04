import assert from "node:assert/strict";
import test from "node:test";

import { getRelease } from "../release.ts";

const tag = "v2026.09.04.153117";
const isoName = `tailboot-${tag}-amd64.iso`;
const assets = [
  { name: isoName, state: "uploaded", size: 1024 },
  { name: `${isoName}.sha256`, state: "uploaded", size: 104 },
];

test("selects the published ISO and size using a fixed repository URL", async () => {
  const release = await getRelease(async (input) => {
    assert.equal(input, "https://api.github.com/repos/ShoeBoom/tailboot/releases/latest");
    return Response.json({ tag_name: tag, assets });
  });
  assert.deepEqual(release, {
    tag,
    isoName,
    size: 1024,
    upstreamUrl: `https://github.com/ShoeBoom/tailboot/releases/download/${tag}/${isoName}`,
  });
});

test("fails the build when release discovery fails", async () => {
  for (const status of [404, 403, 500]) {
    await assert.rejects(
      getRelease(async () => new Response(null, { status })),
      new RegExp(`HTTP ${status}`),
    );
  }
  await assert.rejects(getRelease(async () => { throw new Error("offline"); }), /offline/);
});

test("rejects incomplete releases and unexpected tags", async () => {
  for (const release of [
    { tag_name: "../other", assets },
    { tag_name: tag, assets: [] },
    { tag_name: tag, assets: assets.slice(0, 1) },
    { tag_name: tag, assets: assets.slice(1) },
    { tag_name: tag, assets: [{ ...assets[0], state: "starter" }, assets[1]] },
    { tag_name: tag, assets: [assets[0], { ...assets[1], state: "starter" }] },
    { tag_name: tag, assets: [{ ...assets[0], size: 0 }, assets[1]] },
  ]) {
    await assert.rejects(getRelease(async () => Response.json(release)));
  }
});
