import type { AstroIntegration } from "astro";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { getRelease } from "./release.ts";

const releaseIntegration = {
  name: "tailboot-release",
  hooks: {
    "astro:config:setup": async ({ command, updateConfig }) => {
      const release = command === "build" ? await getRelease() : null;
      updateConfig({
        vite: {
          define: {
            __TAILBOOT_RELEASE__: JSON.stringify(release),
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
