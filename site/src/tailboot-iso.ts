/**
 * Browser-side Tailboot ISO customizer.
 *
 * The base ISO must contain AUTH_KEY_PLACEHOLDER exactly once in an
 * uncompressed file. The recommended location is /TAILBOOT.KEY in the ISO9660
 * root. Keep it outside the live system's SquashFS: changing compressed data
 * in place would corrupt the filesystem.
 */

const encoder = new TextEncoder();

const AUTH_KEY_CAPACITY = 512;

/** Write this exact string to /TAILBOOT.KEY when building the base ISO. */
export const AUTH_KEY_PLACEHOLDER =
  "~".repeat(AUTH_KEY_CAPACITY) + "\n";

const placeholderBytes = encoder.encode(AUTH_KEY_PLACEHOLDER);

type PatchOptions = {
  source: Blob | ReadableStream<Uint8Array>;
  accessKey: string;
  destination: WritableStream<Uint8Array>;
  onProgress?: (inputBytes: number) => void;
};

function concatBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength === 0) return right;
  const joined = new Uint8Array(left.byteLength + right.byteLength);
  joined.set(left);
  joined.set(right, left.byteLength);
  return joined;
}

function indexOfBytes(
  haystack: Uint8Array,
  needle: Uint8Array,
  fromIndex = 0,
) {
  const lastStart = haystack.byteLength - needle.byteLength;

  outer: for (let index = fromIndex; index <= lastStart; index += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }

  return -1;
}

function isoPatcher(accessKey: string, onProgress?: PatchOptions["onProgress"]) {
  const replacementBytes = encoder.encode(
    accessKey.padEnd(AUTH_KEY_CAPACITY, " ") + "\n",
  );
  const overlapSize = placeholderBytes.byteLength - 1;
  let pending = new Uint8Array();
  let inputBytes = 0;
  let matches = 0;

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      inputBytes += bytes.byteLength;
      let buffer = concatBytes(pending, bytes);
      let emittedThrough = 0;
      let matchAt = indexOfBytes(buffer, placeholderBytes);

      while (matchAt !== -1) {
        if (matchAt > emittedThrough) {
          controller.enqueue(buffer.subarray(emittedThrough, matchAt));
        }
        controller.enqueue(replacementBytes.slice());
        matches += 1;
        emittedThrough = matchAt + placeholderBytes.byteLength;
        matchAt = indexOfBytes(buffer, placeholderBytes, emittedThrough);
      }

      buffer = buffer.subarray(emittedThrough);
      const emitLength = Math.max(0, buffer.byteLength - overlapSize);
      if (emitLength > 0) controller.enqueue(buffer.subarray(0, emitLength));
      pending = buffer.slice(emitLength);

      onProgress?.(inputBytes);
    },

    flush(controller) {
      if (pending.byteLength > 0) controller.enqueue(pending);
      if (matches === 0) {
        throw new Error(
          "This is not a customizable Tailboot ISO: the auth-key slot was not found.",
        );
      }
      if (matches !== 1) {
        throw new Error(
          `The ISO contains ${matches} auth-key slots; expected exactly one.`,
        );
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
export async function patchTailbootIso({
  source,
  accessKey,
  destination,
  onProgress,
}: PatchOptions) {
  const stream = source instanceof Blob ? source.stream() : source;
  await stream
    .pipeThrough(isoPatcher(accessKey, onProgress))
    .pipeTo(destination);
}
