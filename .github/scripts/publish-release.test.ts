import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const tag = "v2026.09.05.000000";
const iso = `tailboot-${tag}-amd64.iso`;
const cli = `tailboot-${tag}-linux-arm64`;
const script = resolve(".github/scripts/publish-release.sh");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

test("publishes only a complete, verified draft", async (t) => {
  for (const scenario of [
    "success", "published", "missing-cli", "corrupt-iso", "corrupt-cli",
    "missing-checksum", "wrong-metadata", "download-failure", "inventory-failure",
  ]) {
    await t.test(scenario, async () => {
      const dir = await mkdtemp(join(tmpdir(), "tailboot-publish-"));
      try {
        const assets = join(dir, "assets");
        await mkdir(assets);
        for (const name of [iso, `tailboot-${tag}-linux-x64`, cli]) {
          await writeFile(join(assets, name), name);
          await writeFile(join(assets, `${name}.sha256`), `${hash(name)}  ${name}\n`);
        }
        await writeFile(join(assets, "release.json"), JSON.stringify({
          tag, isoName: iso, sha256: hash(iso), configOffset: scenario === "wrong-metadata" ? 1 : 4096,
        }));
        if (scenario === "missing-cli") await rm(join(assets, cli));
        if (scenario === "missing-checksum") await rm(join(assets, `${iso}.sha256`));
        if (scenario === "corrupt-iso") await writeFile(join(assets, iso), "corrupted");
        if (scenario === "corrupt-cli") await writeFile(join(assets, cli), "corrupted");

        // A local gh fixture models uploaded bytes and records publication. It never
        // contacts GitHub, so failure tests cannot mutate an actual release.
        await writeFile(join(dir, "gh"), `#!/usr/bin/env node
          const fs = require("node:fs");
          const args = process.argv.slice(2);
          const scenario = process.env.TEST_SCENARIO;
          if (args[0] !== "release" || args[2] !== process.env.RELEASE_TAG) process.exit(2);
          if (args[1] === "view") {
            if (args.includes("isDraft")) console.log(scenario !== "published");
            else {
              if (scenario === "inventory-failure") process.exit(1);
              console.log(fs.readdirSync(process.env.TEST_ASSETS).join("\\n"));
            }
          } else if (args[1] === "download") {
            if (scenario === "download-failure") process.exit(1);
            fs.cpSync(process.env.TEST_ASSETS, args[args.indexOf("--dir") + 1], { recursive: true });
          } else if (args[1] === "edit") {
            if (process.cwd() !== process.env.TEST_REPO) process.exit(3);
            fs.writeFileSync(process.env.TEST_PUBLISHED, JSON.stringify(args));
          } else process.exit(2);
        `, { mode: 0o755 });
        const result = spawnSync("bash", [script], {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            RELEASE_TAG: tag,
            ISO_NAME: iso,
            CONFIG_OFFSET: "4096",
            TEST_SCENARIO: scenario,
            TEST_ASSETS: assets,
            TEST_PUBLISHED: join(dir, "published"),
            TEST_REPO: process.cwd(),
          },
        });
        const published = (await readdir(dir)).includes("published");
        if (scenario === "success") {
          assert.equal(result.status, 0, result.stderr);
          assert.deepEqual(JSON.parse(await readFile(join(dir, "published"), "utf8")),
            ["release", "edit", tag, "--draft=false", "--latest"]);
          assert.equal(published, true);
        } else {
          assert.notEqual(result.status, 0);
          assert.equal(published, false);
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
});
