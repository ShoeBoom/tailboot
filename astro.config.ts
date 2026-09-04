import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://tailboot.download",
  // Compression drops the whitespace around inline links and code.
  compressHTML: false,
});
