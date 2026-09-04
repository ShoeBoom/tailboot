import { execFileSync } from "node:child_process";

import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

const releaseTag = process.env.WORKERS_CI === "1"
  ? execFileSync(
      "git",
      ["tag", "--points-at", "HEAD", "--list", "v*", "--sort=-version:refname"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")[0]
  : "";

if (process.env.WORKERS_CI === "1" && !releaseTag) {
  throw new Error("The checked-out commit has no Tailboot release tag.");
}

export default defineConfig({
  adapter: cloudflare({ imageService: "passthrough" }),
  output: "server",
  session: false,
  vite: {
    define: {
      __TAILBOOT_RELEASE_TAG__: JSON.stringify(releaseTag),
    },
  },
});
