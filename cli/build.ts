import { rm, writeFile } from "node:fs/promises";
import { z } from "zod";

const metadata = z.object({
  isoName: z.string().min(1),
  release: z.string().min(1),
  configOffset: z.coerce.number().int().nonnegative(),
}).parse({
  isoName: process.env.PUBLIC_TAILBOOT_ISO_NAME,
  release: process.env.PUBLIC_TAILBOOT_RELEASE,
  configOffset: process.env.PUBLIC_TAILBOOT_CONFIG_OFFSET,
});

await rm("dist", { recursive: true, force: true });
await writeFile("src/release.ts", `export const metadata = ${JSON.stringify(metadata)};\n`);
