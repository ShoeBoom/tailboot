import assert from "node:assert/strict";
import test from "node:test";

import { proxyTailbootIso } from "../src/iso-proxy.ts";

const selectedRelease = {
  tag: "v2026.09.04.153117",
  isoName: "tailboot-v2026.09.04.153117-amd64.iso",
  size: 10,
  upstreamUrl:
    "https://github.com/ShoeBoom/tailboot/releases/download/v2026.09.04.153117/tailboot-v2026.09.04.153117-amd64.iso",
};
const isoUrl = `https://tailboot.example/${selectedRelease.isoName}`;
const neverFetch: typeof fetch = async () => {
  assert.fail("The upstream must not be called");
};

test("does not expose an upstream in development builds", async () => {
  const result = await proxyTailbootIso(new Request(isoUrl), null, neverFetch);
  assert.equal(result.status, 503);
});

test("streams the full selected ISO without forwarding credentials or range headers", async () => {
  const source = new ReadableStream<Uint8Array>();
  const result = await proxyTailbootIso(
    new Request(isoUrl, {
      headers: {
        Range: "bytes=10-19",
        "Sec-Fetch-Site": "same-origin",
        Authorization: "must-not-be-forwarded",
        Cookie: "must-not-be-forwarded",
      },
    }),
    selectedRelease,
    async (input, init) => {
      const upstreamRequest = new Request(input, init);
      assert.equal(upstreamRequest.url, selectedRelease.upstreamUrl);
      assert.equal(upstreamRequest.headers.has("Range"), false);
      assert.equal(upstreamRequest.headers.has("Authorization"), false);
      assert.equal(upstreamRequest.headers.has("Cookie"), false);
      return new Response(source, { headers: { "Set-Cookie": "must-not-be-copied=true" } });
    },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body, source);
  assert.equal(result.headers.get("Content-Length"), "10");
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal(result.headers.has("Set-Cookie"), false);
  assert.equal(result.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
  await result.body?.cancel();
});

test("rejects stale releases, alternate paths, query strings, methods, and cross-site use", async () => {
  const cases = [
    { request: new Request("https://tailboot.example/tailboot-v2026.08.01.041700-amd64.iso"), status: 404 },
    { request: new Request("https://tailboot.example/other.iso"), status: 404 },
    { request: new Request(`${isoUrl}?url=https://example.com`), status: 404 },
    { request: new Request(isoUrl, { method: "POST" }), status: 405 },
    { request: new Request(isoUrl, { headers: { "Sec-Fetch-Site": "cross-site" } }), status: 403 },
    { request: new Request(isoUrl, { headers: { "Sec-Fetch-Site": "same-site" } }), status: 403 },
  ];
  for (const { request, status } of cases) {
    assert.equal((await proxyTailbootIso(request, selectedRelease, neverFetch)).status, status);
  }
});

test("supports HEAD and direct browser navigation", async () => {
  const result = await proxyTailbootIso(
    new Request(isoUrl, { method: "HEAD", headers: { "Sec-Fetch-Site": "none" } }),
    selectedRelease,
    async (_, init) => {
      assert.equal(init?.method, "HEAD");
      return new Response(null);
    },
  );
  assert.equal(result.status, 200);
  assert.equal(result.body, null);
  assert.equal(result.headers.get("Content-Length"), "10");
});

test("rejects partial responses and upstream errors, cancelling the unused body", async () => {
  for (const status of [206, 404, 500]) {
    let cancelled = false;
    const result = await proxyTailbootIso(new Request(isoUrl), selectedRelease, async () => {
      return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status });
    });
    assert.equal(result.status, 502);
    assert.equal(cancelled, true);
  }
  const empty = await proxyTailbootIso(new Request(isoUrl), selectedRelease, async () => new Response(null));
  assert.equal(empty.status, 502);
});

test("handles fetch failures and propagates client cancellation upstream", async (t) => {
  t.mock.method(console, "error", () => {});
  const result = await proxyTailbootIso(new Request(isoUrl), selectedRelease, async () => {
    throw new Error("offline");
  });
  assert.equal(result.status, 502);

  const controller = new AbortController();
  let upstreamSignal: AbortSignal | null | undefined;
  await proxyTailbootIso(new Request(isoUrl, { signal: controller.signal }), selectedRelease, async (_, init) => {
    upstreamSignal = init?.signal;
    return new Response("0123456789");
  });
  controller.abort();
  assert.equal(upstreamSignal?.aborted, true);
});
