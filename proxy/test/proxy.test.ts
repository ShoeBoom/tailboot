import assert from "node:assert/strict";
import test from "node:test";

import worker, { proxyRelease } from "../src/index.ts";

const origin = "https://shoeboom.github.io";
const tag = "v2026.09.04.153117";
const url = `https://proxy.example/${tag}`;
function request(path = url, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", origin);
  return new Request(path, { ...init, headers });
}
const neverFetch: typeof fetch = async () => {
  assert.fail("The upstream must not be called");
};

test("streams versioned Tailboot ISOs with CORS and without forwarding client headers", async () => {
  for (const releaseTag of [tag, "v2026.08.01.041700"]) {
    const body = new ReadableStream<Uint8Array>();
    const response = await proxyRelease(request(`https://proxy.example/${releaseTag}`, {
      headers: { Authorization: "private", Cookie: "private", Range: "bytes=0-9" },
    }), origin, async (input, init) => {
      const upstream = new Request(input, init);
      assert.equal(upstream.url,
        `https://github.com/ShoeBoom/tailboot/releases/download/${releaseTag}/tailboot-${releaseTag}-amd64.iso`);
      assert.equal(upstream.method, "GET");
      assert.equal(upstream.headers.has("Authorization"), false);
      assert.equal(upstream.headers.has("Cookie"), false);
      assert.equal(upstream.headers.has("Origin"), false);
      assert.equal(upstream.headers.has("Range"), false);
      return new Response(body, {
        headers: { "Content-Length": "100", "Set-Cookie": "private" },
      });
    });
    assert.equal(response.status, 200);
    assert.equal(response.body, body);
    assert.equal(response.headers.get("Content-Length"), "100");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(response.headers.get("Vary"), "Origin");
    assert.equal(response.headers.has("Access-Control-Allow-Credentials"), false);
    assert.equal(response.headers.has("Set-Cookie"), false);
    await response.body?.cancel();
  }
});

test("rejects other origins, missing origins, and opaque origins before fetching", async () => {
  for (const otherOrigin of ["https://other.example", "https://shoeboom.github.io.evil.example", "null", ""]) {
    const response = await proxyRelease(request(url, { headers: { Origin: otherOrigin } }), origin, neverFetch);
    assert.equal(response.status, 403);
    assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
  }
  const response = await proxyRelease(new Request(url), origin, neverFetch);
  assert.equal(response.status, 403);
});

test("restricts the upstream to the release ISO derived from a CalVer tag", async () => {
  for (const path of [
    "/", "/latest", `/${tag}/other.iso`, `/${tag}?url=https://evil.example`,
    "/https://evil.example", "/%2e%2e%2fother", `/${tag}%2fother`,
  ]) {
    const response = await proxyRelease(request(`https://proxy.example${path}`), origin, neverFetch);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  }
});

test("handles preflight locally and does not grant custom request headers", async () => {
  const response = await proxyRelease(request(url, {
    method: "OPTIONS",
    headers: { "Access-Control-Request-Method": "GET" },
  }), origin, neverFetch);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, HEAD");
  assert.equal(response.headers.has("Access-Control-Allow-Headers"), false);

  for (const init of [
    { method: "POST" },
    { method: "OPTIONS", headers: { "Access-Control-Request-Method": "POST" } },
  ]) {
    const denied = await proxyRelease(request(url, init), origin, neverFetch);
    assert.equal(denied.status, 405);
  }
  const deniedOrigin = await proxyRelease(request(url, {
    method: "OPTIONS",
    headers: { Origin: "https://other.example", "Access-Control-Request-Method": "GET" },
  }), origin, neverFetch);
  assert.equal(deniedOrigin.status, 403);
});

test("supports HEAD without downloading a response body", async () => {
  const response = await proxyRelease(request(url, { method: "HEAD" }), origin, async (_, init) => {
    assert.equal(init?.method, "HEAD");
    return new Response(null, { headers: { "Content-Length": "100" } });
  });
  assert.equal(response.status, 200);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("Content-Length"), "100");
});

test("cancels upstream errors and returns errors readable by the allowed site", async () => {
  for (const [upstreamStatus, expectedStatus] of [[404, 404], [500, 502], [206, 502]]) {
    let cancelled = false;
    const response = await proxyRelease(request(), origin, async () => new Response(
      new ReadableStream({ cancel() { cancelled = true; } }), { status: upstreamStatus },
    ));
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(cancelled, true);
  }
  const empty = await proxyRelease(request(), origin, async () => new Response(null));
  assert.equal(empty.status, 502);
});

test("handles network errors and propagates cancellation", async (t) => {
  t.mock.method(console, "error", () => {});
  const failed = await proxyRelease(request(), origin, async () => { throw new Error("offline"); });
  assert.equal(failed.status, 502);
  assert.equal(failed.headers.get("Access-Control-Allow-Origin"), origin);

  const controller = new AbortController();
  let signal: AbortSignal | null | undefined;
  const response = await proxyRelease(request(url, { signal: controller.signal }), origin, async (_, init) => {
    signal = init?.signal;
    return new Response("ISO");
  });
  controller.abort();
  assert.equal(signal?.aborted, true);
  await response.body?.cancel();
});

test("Worker uses its configured origin", async () => {
  const response = await worker.fetch(request(url, { headers: { Origin: "https://other.example" } }), {
    ALLOWED_ORIGIN: origin,
  });
  assert.equal(response.status, 403);
});
