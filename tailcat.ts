import { x25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";

// Tailcat v0.6.0 saved-key and wire formats. Keep in sync with the pinned
// image binary; test-tailcat.ts checks these against the real CLI.
const keyField = (prefix: string) => z.string()
  .regex(new RegExp(`^${prefix}:[0-9a-f]{64}$`))
  .refine((value) => !value.endsWith("0".repeat(64)), "Key must not be zero.");

const tailcatKeySchema = z.object({
  Private: keyField("privkey"),
  Public: z.object({
    ServerPublic: keyField("nodekey"),
    ServerDiscoPublic: keyField("discokey"),
    PresharedKey: keyField("psk"),
    // A fixed relay keeps the address usable before and after boot.
    RegionID: z.number().int().min(1).max(65535),
    Region: z.array(z.never()).max(0).optional(),
  }),
});

export type TailcatKey = z.infer<typeof tailcatKeySchema>;

function clampScalar(bytes: Uint8Array) {
  bytes[0] &= 248;
  bytes[31] &= 127;
  bytes[31] |= 64;
  return bytes;
}

function publicKeys(privateBytes: Uint8Array) {
  const disco = clampScalar(hmac(sha256, privateBytes,
    new TextEncoder().encode("github.com/tailscale/tailcat disco key v1")));
  return {
    ServerPublic: `nodekey:${bytesToHex(x25519.getPublicKey(privateBytes))}`,
    ServerDiscoPublic: `discokey:${bytesToHex(x25519.getPublicKey(disco))}`,
  };
}

/** Generate locally with the OS CSPRNG. There is deliberately no password input. */
export function generateTailcatKey(): TailcatKey {
  const privateBytes = clampScalar(crypto.getRandomValues(new Uint8Array(32)));
  return {
    Private: `privkey:${bytesToHex(privateBytes)}`,
    Public: {
      ...publicKeys(privateBytes),
      PresharedKey: `psk:${bytesToHex(crypto.getRandomValues(new Uint8Array(32)))}`,
      RegionID: 301, // Tailcat's New York bootstrap relay; peers can connect directly.
    },
  };
}

/** Validate the native key structure and verify that both public keys match. */
export function parseTailcatKey(input: unknown): TailcatKey {
  const result = tailcatKeySchema.safeParse(input);
  if (!result.success) {
    throw new Error("Import a Tailcat 0.6.0 private key with a pre-shared key and a fixed relay region (tailcat genkey --key=tailboot --region=301). An address or password is not a server key.");
  }
  const key = result.data;
  const privateBytes = hexToBytes(key.Private.slice(8));
  const expected = publicKeys(privateBytes);
  if (key.Public.ServerPublic !== expected.ServerPublic ||
      key.Public.ServerDiscoPublic !== expected.ServerDiscoPublic) {
    throw new Error("The Tailcat public keys do not match the private key. Import the original key file or generate a new identity.");
  }
  return key;
}

export function importTailcatKey(text: string) {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("Paste the contents of a Tailcat .private.json key file, or generate a new identity. Addresses and passwords cannot be imported.");
  }
  return parseTailcatKey(input);
}

/** Encode the four fields of a fixed-region Tailcat address as CBOR + base64url. */
export function tailcatAddress(key: TailcatKey) {
  const { ServerPublic, ServerDiscoPublic, PresharedKey, RegionID } = key.Public;
  const bytes = new Uint8Array([
    0xa4, // map(4)
    0x61, 0x70, 0x58, 0x20, ...hexToBytes(ServerPublic.slice(8)),
    0x61, 0x6b, 0x58, 0x20, ...hexToBytes(ServerDiscoPublic.slice(9)),
    0x61, 0x71, 0x58, 0x20, ...hexToBytes(PresharedKey.slice(4)),
    0x61, 0x69, 0x19, RegionID >> 8, RegionID & 255,
  ]);
  return "tc" + btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
