/**
 * Shared Tailboot ISO customizer for the browser and CLI.
 *
 * The base ISO must contain CONFIG_PLACEHOLDER in an uncompressed file
 * at /TAILBOOT.JSON.
 * Keep it outside the live system's SquashFS: changing compressed data
 * in place would corrupt the filesystem.
 */

const CONFIG_CAPACITY = 4095;

/** Write this exact 4096-byte record to /TAILBOOT.JSON in the base ISO. */
export const CONFIG_PLACEHOLDER =
  "TAILBOOT_CONFIG_V1".padEnd(CONFIG_CAPACITY, "~") + "\n";

const placeholderBytes = new Uint8Array(CONFIG_PLACEHOLDER.length);
for (let i = 0; i < placeholderBytes.length; i++) {
  placeholderBytes[i] = CONFIG_PLACEHOLDER.charCodeAt(i);
}

type PatchOptions = {
  configBytes: Uint8Array;
  configOffset: number;
  onProgress?: (inputBytes: number) => void;
};

export function createIsoPatcher({ configBytes, configOffset, onProgress }: PatchOptions) {
  const replacementBytes = new Uint8Array(placeholderBytes.byteLength);
  for (let i = 0; i < replacementBytes.length; i++) replacementBytes[i] = 32;
  const configEnd = configOffset + placeholderBytes.byteLength;
  let inputBytes = 0;

  return {
    start(controller: { error(error: Error): void }) {
      if (!Number.isSafeInteger(configOffset) || configOffset < 0 ||
          !Number.isSafeInteger(configEnd)) {
        controller.error(new Error("The ISO configuration slot offset is invalid."));
        return;
      }
      if (configBytes.byteLength > CONFIG_CAPACITY) {
        controller.error(new Error(
          `Configuration exceeds the ${CONFIG_CAPACITY}-byte ISO slot.`,
        ));
        return;
      }
      replacementBytes.set(configBytes);
      replacementBytes[CONFIG_CAPACITY] = 10;
    },

    transform(bytes: Uint8Array, controller: { enqueue(bytes: Uint8Array): void }) {
      const chunkStart = inputBytes;
      inputBytes += bytes.byteLength;
      const start = Math.max(configOffset, chunkStart);
      const end = Math.min(configEnd, inputBytes);

      if (start < end) {
        for (let offset = start; offset < end; offset += 1) {
          if (bytes[offset - chunkStart] !== placeholderBytes[offset - configOffset]) {
            throw new Error(
              "This is not a compatible Tailboot ISO: the configuration slot does not match the release offset.",
            );
          }
        }
        if (start > chunkStart) {
          controller.enqueue(bytes.subarray(0, start - chunkStart));
        }
        controller.enqueue(replacementBytes.subarray(start - configOffset, end - configOffset));
        if (end < inputBytes) {
          controller.enqueue(bytes.subarray(end - chunkStart));
        }
      } else {
        controller.enqueue(bytes);
      }

      onProgress?.(inputBytes);
    },

    flush() {
      if (inputBytes < configEnd) {
        throw new Error("The ISO ended before the complete configuration slot was received.");
      }
    },
  };
}
