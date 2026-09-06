import { Buffer } from "node:buffer";
import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { z } from "zod";
import { createIsoPatcher } from "../../tailboot-iso-core.ts";
import { metadata } from "../dist/release.ts";

async function main() {
  const args = process.argv.slice(2);
  const program = new Command()
    .name("tailboot")
    .description("Download and customize a Tailboot ISO.")
    .argument("<auth-key>", "Tailscale auth key")
    .argument("<output.iso>", "path for the customized ISO")
    .option("--wifi-ssid <ssid>", "Wi-Fi network name")
    .option("--wifi-password <password>", "Wi-Fi password");
  if (args.length === 0) {
    program.outputHelp();
    return;
  }
  program.parse(args, { from: "user" });
  const values = program.opts<{ wifiSsid?: string; wifiPassword?: string }>();
  const positional = z.array(z.string().min(1)).length(2).parse(program.args);
  const authKey = positional[0];
  const output = positional[1];
  const wifi = z.object({ ssid: z.string().min(1), password: z.string().min(1) }).optional()
    .parse(values.wifiSsid === undefined && values.wifiPassword === undefined
      ? undefined
      : { ssid: values.wifiSsid, password: values.wifiPassword });
  const config = { authKey, wifi };
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
