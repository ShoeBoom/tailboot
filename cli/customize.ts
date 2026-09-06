import { createHash } from "node:crypto";

import { patchTailbootIso, type TailbootConfig } from "../tailboot-iso.ts";

export type IsoRelease = {
  tag: string;
  isoName: string;
  sha256: string;
  configOffset: number;
};

export function isoUrl(release: IsoRelease) {
  return `https://github.com/ShoeBoom/tailboot/releases/download/${release.tag}/${release.isoName}`;
}

/** Verify before patching; keep the complete result in memory until it succeeds. */
export async function customizeIso(
  bytes: Uint8Array,
  release: IsoRelease,
  config: TailbootConfig,
) {
  if (createHash("sha256").update(bytes).digest("hex") !== release.sha256) {
    throw new Error("The downloaded ISO does not match the embedded SHA-256.");
  }

  // The patcher returns views around the slot, so no second ISO-sized buffer is needed.
  const chunks: Uint8Array[] = [];
  await patchTailbootIso({
    source: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    config,
    configOffset: release.configOffset,
    destination: new WritableStream({ write(chunk) { chunks.push(chunk); } }),
  });
  return chunks;
}
