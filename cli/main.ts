import { open, unlink } from "node:fs/promises";
import { parseArgs } from "node:util";

import { customizeIso, isoUrl, type IsoRelease } from "./customize.ts";

// Replaced by nub compile. A binary always belongs to this one verified release.
declare const TAILBOOT_RELEASE: IsoRelease;
const release = TAILBOOT_RELEASE;

class CliError extends Error {}

const help = `Usage: tailboot --output customized.iso [options]

  --auth-key KEY       Tailscale auth key (or TAILBOOT_AUTH_KEY)
  --wifi-ssid SSID     Optional Wi-Fi network (or TAILBOOT_WIFI_SSID)
  --wifi-password PW   Wi-Fi password (or TAILBOOT_WIFI_PASSWORD)
  --output PATH       Create a new ISO file; existing files are never overwritten
  --version           Show the embedded ISO release metadata
  --help              Show this help

Downloads only the embedded release. The ISO is verified and customized in RAM.
Credentials stay on this computer. Environment variables avoid putting them in
command-line arguments. No installed Node.js or Nub is required.
`;

async function main() {
  const { values } = (() => {
    try {
      return parseArgs({ options: {
        "auth-key": { type: "string" },
        "wifi-ssid": { type: "string" },
        "wifi-password": { type: "string" },
        output: { type: "string" },
        version: { type: "boolean" },
        help: { type: "boolean" },
      } });
    } catch {
      // Argument parser errors can include credential values. Never print them.
      throw new CliError("Invalid arguments. Run with --help for usage.");
    }
  })();

  if (values.help) {
    process.stdout.write(help);
    return;
  }
  if (values.version) {
    process.stdout.write(`${JSON.stringify(release, null, 2)}\n`);
    return;
  }

  const authKey = values["auth-key"] ?? process.env.TAILBOOT_AUTH_KEY;
  const ssid = values["wifi-ssid"] ?? process.env.TAILBOOT_WIFI_SSID;
  const password = values["wifi-password"] ?? process.env.TAILBOOT_WIFI_PASSWORD;
  if (authKey === undefined) throw new CliError("Provide --auth-key or TAILBOOT_AUTH_KEY.");
  if (!values.output) throw new CliError("Provide --output for the customized ISO.");
  if (ssid && !password) throw new CliError("Provide a password for the Wi-Fi network.");
  const config = {
    authKey,
    ...(ssid && password ? { wifi: { ssid, password } } : {}),
  };

  process.stderr.write(`Downloading Tailboot ${release.tag}...\n`);
  let bytes: Uint8Array;
  try {
    const response = await fetch(isoUrl(release));
    if (!response.ok) throw new Error();
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new CliError("The ISO download failed. No output file was created.");
  }

  let chunks: Uint8Array[];
  try {
    chunks = await customizeIso(bytes, release, config);
  } catch {
    throw new CliError("ISO verification or configuration failed. No output file was created.");
  }

  // Open only after all download, checksum and slot checks pass. Exclusive creation
  // protects existing files; owner-only permissions protect the embedded credentials.
  const output = await open(values.output, "wx", 0o600).catch(() => {
    throw new CliError("Cannot create the output file. Choose a new, writable path.");
  });
  try {
    await output.writeFile(chunks);
    await output.sync();
    await output.close();
  } catch {
    await output.close().catch(() => {});
    await unlink(values.output).catch(() => {});
    throw new CliError("Could not finish writing the ISO. Check the output path before using it.");
  }
  process.stdout.write("Customized ISO saved.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof CliError ? error.message : "Tailboot failed."}\n`);
  process.exitCode = 1;
});
