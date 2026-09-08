import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { generateTailcatKey, importTailcatKey, tailcatAddress } from "../../tailcat.ts";

const binary = resolve(process.argv[2] ?? "image/chroot/usr/bin/tailcat");
const work = await mkdtemp(join(tmpdir(), "tailboot-tailcat-"));
const env = { ...process.env, XDG_CONFIG_HOME: work, XDG_CACHE_HOME: work };
const run = (...args: string[]) => execFileSync(binary, args, {
  env, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"],
}).trim();

try {
  const nativeFile = join(work, "native.private.json");
  const nativeAddress = run("genkey", `--key=${nativeFile}`, "--region=301");
  assert.equal(tailcatAddress(importTailcatKey(await readFile(nativeFile, "utf8"))), nativeAddress);

  const key = generateTailcatKey();
  assert.deepEqual(JSON.parse(run("parse", tailcatAddress(key))), key.Public);
  const keyFile = join(work, "browser.private.json");
  await writeFile(keyFile, JSON.stringify(key), { mode: 0o600 });

  // Use upstream's local relay mode. Public relays and DERP map requests are
  // excluded, so publication depends on our integration, not internet uptime.
  for (let boot = 0; boot < 2; boot++) {
    const addrFile = join(work, `address-${boot}`);
    const server = spawn(binary, [`--key=${keyFile}`, "--derpmap-url=none", "serve", "no-auth-ssh"], {
      env: { ...env, TS_DEBUG_TAILCAT_LOCAL_DERP: "1", TAILCAT_ADDR_FILE: addrFile },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let logs = "";
    server.stderr.on("data", (chunk) => { logs += chunk; });
    const exited = new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.once("exit", () => resolve());
    });
    try {
      let address = "";
      for (let attempt = 0; attempt < 100; attempt++) {
        address = await readFile(addrFile, "utf8").catch(() => "");
        if (address.trim()) break;
        assert.equal(server.exitCode, null, logs);
        await setTimeout(100);
      }
      assert.ok(address.trim(), `Tailcat did not start: ${logs}`);
      const actual = JSON.parse(run("parse", address.trim()));
      for (const field of ["ServerPublic", "ServerDiscoPublic", "PresharedKey"] as const) {
        assert.equal(actual[field], key.Public[field]);
      }
      assert.equal(run("--key=new", "--derpmap-url=none", "ssh", address.trim(),
        "printf", "tailboot-tailcat-ok"), "tailboot-tailcat-ok");
    } finally {
      server.kill("SIGKILL");
      await exited;
    }
  }
  console.log("Verified native key import, generated address parsing, SSH access and identity reuse across restarts.");
} finally {
  await rm(work, { recursive: true, force: true });
}
