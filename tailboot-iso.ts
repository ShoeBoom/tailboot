/**
 * Browser-side Tailboot ISO customizer.
 *
 * The base ISO must contain CONFIG_PLACEHOLDER in an uncompressed file
 * at /TAILBOOT.JSON.
 * Keep it outside the live system's SquashFS: changing compressed data
 * in place would corrupt the filesystem.
 */

const encoder = new TextEncoder();

const CONFIG_CAPACITY = 4095;

/** Write this exact 4096-byte record to /TAILBOOT.JSON in the base ISO. */
export const CONFIG_PLACEHOLDER =
  "TAILBOOT_CONFIG_V1".padEnd(CONFIG_CAPACITY, "~") + "\n";

const placeholderBytes = encoder.encode(CONFIG_PLACEHOLDER);

export type TailbootConfig = {
  authKey: string;
  wifi?: {
    ssid: string;
    password: string;
  };
};

type PatchOptions = {
  source: Blob | ReadableStream<Uint8Array>;
  config: TailbootConfig;
  configOffset: number;
  destination: WritableStream<Uint8Array>;
  onProgress?: (inputBytes: number) => void;
};

function isoPatcher({ config, configOffset, onProgress }: PatchOptions) {
  const configBytes = encoder.encode(JSON.stringify(config));
  const replacementBytes = new Uint8Array(placeholderBytes.byteLength).fill(32);
  const configEnd = configOffset + placeholderBytes.byteLength;
  let inputBytes = 0;

  return new TransformStream<Uint8Array, Uint8Array>({
    start(controller) {
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

    transform(bytes, controller) {
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
  });
}

/**
 * Patch an ISO while piping it to a WritableStream.
 *
 * A FileSystemWritableFileStream from showSaveFilePicker() writes the ISO
 * directly to disk. Other browsers can provide an in-memory destination and
 * download the resulting Blob.
 */
export async function patchTailbootIso(options: PatchOptions) {
  const { source, destination } = options;
  const stream = source instanceof Blob ? source.stream() : source;
  await stream
    .pipeThrough(isoPatcher(options))
    .pipeTo(destination);
}
