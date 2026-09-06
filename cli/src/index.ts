import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { z } from "zod";
import { createIsoPatcher } from "../../tailboot-iso-core.ts";
import { metadata } from "../dist/release.ts";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help") {
    console.log("Usage: tailboot <auth-key> <output.iso> [wifi-ssid wifi-password]");
    return;
  }
  const values = z.array(z.string().min(1))
    .refine((args) => args.length === 2 || args.length === 4)
    .parse(args);
  const authKey = values[0];
  const output = values[1];
  const config = values.length === 4
    ? { authKey, wifi: { ssid: values[2], password: values[3] } }
    : { authKey };
  const url = `https://github.com/ShoeBoom/tailboot/releases/download/${encodeURIComponent(metadata.release)}/${encodeURIComponent(metadata.isoName)}`;

  console.log(`Downloading ${metadata.isoName}…`);
  const response = await fetch(url);
  if (response.status !== 200) throw new Error(`ISO download failed with HTTP ${response.status}.`);
  const iso = await response.bytes();
  const patcher = createIsoPatcher({
    configBytes: Buffer.from(JSON.stringify(config)),
    configOffset: metadata.configOffset,
  });
  const chunks: Uint8Array[] = [];
  patcher.start({ error(error: Error) { throw error; } });
  patcher.transform(iso, { enqueue(chunk: Uint8Array) { chunks.push(chunk); } });
  patcher.flush();
  writeFileSync(output, Buffer.concat(chunks));
  console.log(`Saved ${output}`);
}

main().catch((error: unknown) => {
  if (error instanceof Error) console.error(error.message);
  process.exit(1);
});
