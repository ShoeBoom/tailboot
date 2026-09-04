import { execFileSync } from "node:child_process";

import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

function getRelease() {
  if (process.env.TAILBOOT_DEV === "1") {
    return {
      tag: "development",
      isoName: "tailboot.iso",
      upstreamUrl: "",
    };
  }

  const tag = execFileSync(
    "git",
    ["tag", "--points-at", "HEAD", "--list", "v*", "--sort=-version:refname"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")[0];
  if (!tag) throw new Error("The checked-out commit has no Tailboot release tag.");

  const isoName = `tailboot-${tag}-amd64.iso`;
  return {
    tag,
    isoName,
    upstreamUrl: `https://github.com/ShoeBoom/tailboot/releases/download/${tag}/${isoName}`,
  };
}

export default defineConfig({
  adapter: cloudflare({ imageService: "passthrough" }),
  output: "server",
  session: false,
  vite: {
    define: {
      __TAILBOOT_RELEASE__: JSON.stringify(getRelease()),
    },
  },
});
