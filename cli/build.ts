import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { IsoRelease } from "./customize.ts";

const metadataPath = process.argv[2];
if (!metadataPath) throw new Error("Usage: pnpm build:cli path/to/release.json");
const release: IsoRelease = JSON.parse(await readFile(metadataPath, "utf8"));
if (!/^v\d{4}\.\d{2}\.\d{2}\.\d{6}$/.test(release.tag) ||
    release.isoName !== `tailboot-${release.tag}-amd64.iso` ||
    !/^[a-f0-9]{64}$/.test(release.sha256) ||
    !Number.isSafeInteger(release.configOffset) || release.configOffset < 0 ||
    !Number.isSafeInteger(release.configOffset + 4096)) {
  throw new Error("Invalid verified ISO release metadata.");
}
const platform = `${process.platform}-${process.arch}`;
if (!["linux-x64", "linux-arm64"].includes(platform)) {
  throw new Error("Build CLI binaries on Linux x64 or arm64.");
}
await mkdir("cli/dist", { recursive: true });
execFileSync("nub", [
  "compile", "cli/main.ts",
  "--target", "24.18.0",
  "--platform", platform,
  "--define-file", `TAILBOOT_RELEASE=${resolve(metadataPath)}`,
  "--out", `cli/dist/tailboot-${release.tag}-${platform}`,
], { stdio: "inherit" });
