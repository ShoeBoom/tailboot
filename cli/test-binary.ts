import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { isoUrl, type IsoRelease } from "./customize.ts";

const [binaryArg, isoArg, metadataArg] = process.argv.slice(2);
assert.ok(binaryArg && isoArg && metadataArg,
  "Usage: node cli/test-binary.ts binary verified.iso release.json");
const binary = resolve(binaryArg);
const iso = resolve(isoArg);
const release: IsoRelease = JSON.parse(await readFile(metadataArg, "utf8"));
const size = (await stat(iso)).size;
const workDir = await mkdtemp(join(tmpdir(), "tailboot-cli-"));
const credentials = {
  authKey: 'test-key " \\ $() `private`',
  wifi: { ssid: 'Café "网络" 📶', password: ' spaces " \\ $() `secret` ' },
};
let requests = 0;

// Exercise real HTTP reads and failures. Only the test preload redirects the
// release URL; shipped code exposes no local-ISO or release-URL override.
const server = createServer((request, response) => {
  requests += 1;
  assert.equal(request.method, "GET");
  for (const value of [credentials.authKey, ...Object.values(credentials.wifi)]) {
    assert.ok(!JSON.stringify(request.headers).includes(value));
    assert.ok(!request.url!.includes(encodeURIComponent(value)));
  }
  if (request.url === "/http-error") {
    response.writeHead(503).end("Unavailable");
  } else if (request.url === "/wrong-hash") {
    response.end("not the release ISO");
  } else if (request.url === "/truncated") {
    response.writeHead(200, { "Content-Length": size });
    response.write("partial ISO");
    setTimeout(() => response.destroy(), 20);
  } else {
    response.writeHead(200, { "Content-Length": size });
    createReadStream(iso).pipe(response);
  }
});

async function hashRange(path: string, start: number, end: number) {
  const hash = createHash("sha256");
  if (start <= end) {
    for await (const chunk of createReadStream(path, { start, end })) hash.update(chunk);
  }
  return hash.digest("hex");
}

try {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const preload = join(workDir, "download.mjs");
  await writeFile(preload, `
    import fs from "node:fs/promises";
    import { syncBuiltinESMExports } from "node:module";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, options) => {
      if (url !== ${JSON.stringify(isoUrl(release))} || options !== undefined) {
        throw new Error("Unexpected request");
      }
      return originalFetch(process.env.TAILBOOT_TEST_URL);
    };
    if (process.env.TAILBOOT_TEST_WRITE_FAILURE === "1") {
      const originalOpen = fs.open;
      fs.open = async (...args) => {
        const file = await originalOpen(...args);
        file.writeFile = async () => {
          await file.write("partial ISO");
          throw new Error("Simulated full disk");
        };
        return file;
      };
      syncBuiltinESMExports();
    }
  `);

  async function run(args: string[], route = "/iso", env: NodeJS.ProcessEnv = {}) {
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      execFile(binary, args, {
        cwd: workDir,
        timeout: 180_000,
        env: {
          ...process.env,
          // The cold executable must run without finding Node or Nub on PATH.
          PATH: workDir,
          XDG_CACHE_HOME: join(workDir, "cache"),
          XDG_DATA_HOME: join(workDir, "data"),
          NODE_OPTIONS: `--import=${JSON.stringify(pathToFileURL(preload).href)}`,
          TAILBOOT_TEST_URL: `${baseUrl}${route}`,
          TAILBOOT_AUTH_KEY: credentials.authKey,
          TAILBOOT_WIFI_SSID: credentials.wifi.ssid,
          TAILBOOT_WIFI_PASSWORD: credentials.wifi.password,
          ...env,
        },
      }, (error, stdout, stderr) => resolve({
        code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
        stdout,
        stderr,
      }));
    });
    for (const value of [credentials.authKey, ...Object.values(credentials.wifi)]) {
      assert.ok(!result.stdout.includes(value) && !result.stderr.includes(value), "Credentials were logged");
    }
    return result;
  }

  const version = await run(["--version"]);
  assert.equal(version.code, 0, version.stderr);
  assert.deepEqual(JSON.parse(version.stdout), release);
  assert.equal((await run(["--help"])).code, 0);
  assert.equal(requests, 0);

  for (const [name, args, env, config] of [
    ["wifi", [], {}, credentials],
    ["ethernet", ["--auth-key", "arbitrary key"], { TAILBOOT_WIFI_SSID: "" }, { authKey: "arbitrary key" }],
  ] as const) {
    const output = join(workDir, `${name}.iso`);
    const result = await run(["--output", output, ...args], "/iso", env);
    assert.equal(result.code, 0, result.stderr);
    assert.equal((await stat(output)).size, size);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(await hashRange(output, 0, release.configOffset - 1),
      await hashRange(iso, 0, release.configOffset - 1));
    assert.equal(await hashRange(output, release.configOffset + 4096, size - 1),
      await hashRange(iso, release.configOffset + 4096, size - 1));
    const slot = [];
    for await (const chunk of createReadStream(output, {
      start: release.configOffset, end: release.configOffset + 4095,
    })) slot.push(chunk);
    assert.deepEqual(JSON.parse(Buffer.concat(slot).toString()), config);
    await rm(output);
  }

  for (const route of ["/http-error", "/wrong-hash", "/truncated"]) {
    const output = join(workDir, "failed.iso");
    assert.notEqual((await run(["--output", output], route)).code, 0);
    assert.ok(!(await readdir(workDir)).includes("failed.iso"));
  }
  const oversized = await run(["--output", "oversized.iso"], "/iso", {
    TAILBOOT_AUTH_KEY: "é".repeat(4096),
  });
  assert.notEqual(oversized.code, 0);
  assert.ok(!(await readdir(workDir)).includes("oversized.iso"));

  const priorRequests = requests;
  assert.notEqual((await run(["--unknown", credentials.authKey])).code, 0);
  assert.notEqual((await run(["--output", "missing-wifi.iso"], "/iso", {
    TAILBOOT_WIFI_PASSWORD: "",
  })).code, 0);
  assert.notEqual((await run(["--output", "missing-key.iso"], "/iso", {
    TAILBOOT_AUTH_KEY: undefined,
  })).code, 0);
  assert.equal(requests, priorRequests);

  const existing = join(workDir, "existing.iso");
  await writeFile(existing, "keep this file");
  assert.notEqual((await run(["--output", existing])).code, 0);
  assert.equal(await readFile(existing, "utf8"), "keep this file");

  const writeFailure = await run(["--output", "disk-failure.iso"], "/iso", {
    TAILBOOT_TEST_WRITE_FAILURE: "1",
  });
  assert.notEqual(writeFailure.code, 0);
  assert.match(writeFailure.stderr, /Could not finish writing the ISO/);
  assert.ok(!(await readdir(workDir)).includes("disk-failure.iso"));
  console.log("Verified compiled CLI: embedded metadata and Node, fixed release download, JSON round-trip, unchanged ISO bytes, private output, and failure handling.");
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await rm(workDir, { recursive: true, force: true });
}
