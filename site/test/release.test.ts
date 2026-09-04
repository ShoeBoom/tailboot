import assert from "node:assert/strict";
import test from "node:test";

import { getRelease } from "../release.ts";

const env = {
  TAILBOOT_RELEASE: "v2026.09.04.153117",
  TAILBOOT_ISO_SIZE: "1024",
  TAILBOOT_PROXY_URL: "https://proxy.example",
};

test("pins the site to the workflow's release and byte count", () => {
  assert.deepEqual(getRelease(env), {
    tag: env.TAILBOOT_RELEASE,
    isoName: `tailboot-${env.TAILBOOT_RELEASE}-amd64.iso`,
    size: 1024,
    isoUrl: `https://proxy.example/${env.TAILBOOT_RELEASE}`,
  });
});

test("fails production builds with missing or invalid metadata", () => {
  for (const name of Object.keys(env)) {
    assert.throws(() => getRelease({ ...env, [name]: undefined }), new RegExp(name));
  }
  for (const size of ["0", "-1", "NaN", "1.5", "9007199254740992"]) {
    assert.throws(() => getRelease({ ...env, TAILBOOT_ISO_SIZE: size }), /TAILBOOT_ISO_SIZE/);
  }
  for (const tag of ["latest", "../other", "v2026.09.04.153117/other.iso"]) {
    assert.throws(() => getRelease({ ...env, TAILBOOT_RELEASE: tag }), /TAILBOOT_RELEASE/);
  }
});

test("accepts a local proxy and normalizes a trailing slash", () => {
  assert.equal(
    getRelease({ ...env, TAILBOOT_PROXY_URL: "http://localhost:8787/" }).isoUrl,
    `http://localhost:8787/${env.TAILBOOT_RELEASE}`,
  );
});

test("rejects proxy URLs with paths, credentials, or unsupported protocols", () => {
  for (const url of [
    "https://proxy.example/path", "https://proxy.example/?tag=latest",
    "https://proxy.example/#fragment", "https://user:password@proxy.example",
    "ftp://proxy.example", "not a URL",
  ]) {
    assert.throws(() => getRelease({ ...env, TAILBOOT_PROXY_URL: url }));
  }
});
