import { execFileSync } from "node:child_process";

import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

function getRelease(development: boolean) {
  if (development) {
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

const releaseIntegration = {
  name: "tailboot-release",
  hooks: {
    "astro:config:setup": ({ command, updateConfig }) => {
      updateConfig({
        vite: {
          define: {
            __TAILBOOT_RELEASE__: JSON.stringify(getRelease(command === "dev")),
          },
        },
      });
    },
  },
} satisfies AstroIntegration;

export default defineConfig({
  adapter: cloudflare({ imageService: "passthrough" }),
  integrations: [releaseIntegration],
  output: "server",
  session: false,
});
