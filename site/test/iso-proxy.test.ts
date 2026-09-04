import assert from "node:assert/strict";
import test from "node:test";

import { proxyTailbootIso } from "../src/iso-proxy.ts";

const selectedRelease = {
  isoName: "tailboot-v2026.09.04.153117-amd64.iso",
  upstreamUrl:
    "https://github.com/ShoeBoom/tailboot/releases/download/v2026.09.04.153117/tailboot-v2026.09.04.153117-amd64.iso",
};

test("does not expose an upstream in development builds", async () => {
  let fetched = false;
  const result = await proxyTailbootIso(
    new Request("https://tailboot.example/tailboot.iso"),
    async () => {
      fetched = true;
      return new Response();
    },
    {
      isoName: "tailboot.iso",
      upstreamUrl: "",
    },
  );

  assert.equal(result.status, 503);
  assert.equal(fetched, false);
});

test("streams only the build-selected ISO and forwards range requests", async () => {
  let upstreamRequest: Request | undefined;
  const result = await proxyTailbootIso(
    new Request("https://tailboot.example/tailboot.iso", {
      headers: {
        Range: "bytes=10-19",
        "Sec-Fetch-Site": "same-origin",
        Authorization: "must-not-be-forwarded",
      },
    }),
    async (input, init) => {
      upstreamRequest = new Request(input, init);
      return new Response("0123456789", {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": "10",
          "Content-Range": "bytes 10-19/100",
          "Set-Cookie": "must-not-be-copied=true",
        },
      });
    },
    selectedRelease,
  );

  assert.equal(upstreamRequest?.url, selectedRelease.upstreamUrl);
  assert.equal(upstreamRequest?.headers.get("Range"), "bytes=10-19");
  assert.equal(upstreamRequest?.headers.has("Authorization"), false);
  assert.equal(result.status, 206);
  assert.equal(await result.text(), "0123456789");
  assert.equal(result.headers.get("Content-Range"), "bytes 10-19/100");
  assert.equal(result.headers.has("Set-Cookie"), false);
  assert.equal(
    result.headers.get("Cross-Origin-Resource-Policy"),
    "same-origin",
  );
});

test("rejects alternate paths, query strings, methods, and cross-site use", async () => {
  const neverFetch = async () => {
    throw new Error("The upstream must not be called");
  };
  const requests = [
    new Request("https://tailboot.example/other.iso"),
    new Request("https://tailboot.example/tailboot.iso?url=https://example.com"),
    new Request("https://tailboot.example/tailboot.iso", { method: "POST" }),
    new Request("https://tailboot.example/tailboot.iso", {
      headers: { "Sec-Fetch-Site": "cross-site" },
    }),
  ];

  for (const request of requests) {
    const result = await proxyTailbootIso(request, neverFetch);
    assert.notEqual(result.status, 200);
  }
});
