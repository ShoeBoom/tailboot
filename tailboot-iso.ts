/**
 * Browser-side Tailboot ISO customizer.
 *
 * The base ISO must contain AUTH_KEY_PLACEHOLDER exactly once in an
 * uncompressed file. The recommended location is /TAILBOOT.KEY in the ISO9660
 * root. Keep it outside the live system's SquashFS: changing compressed data
 * in place would corrupt the filesystem.
 */

const encoder = new TextEncoder();

export const AUTH_KEY_CAPACITY = 512;

const SLOT_START = "TAILBOOT_TAILSCALE_AUTH_KEY_V1_BEGIN\n";
const SLOT_END = "\nTAILBOOT_TAILSCALE_AUTH_KEY_V1_END\n";
const EMPTY_SLOT_BYTE = "~";

/** Write this exact string to /TAILBOOT.KEY when building the base ISO. */
export const AUTH_KEY_PLACEHOLDER =
  SLOT_START + EMPTY_SLOT_BYTE.repeat(AUTH_KEY_CAPACITY) + SLOT_END;

const placeholderBytes = encoder.encode(AUTH_KEY_PLACEHOLDER);

export type IsoSource = Blob | Response | ReadableStream<Uint8Array>;
export type PatchProgress = {
  inputBytes: number;
  totalBytes?: number;
};

type PatchOptions = {
  source: IsoSource;
  accessKey: string;
  destination: WritableStream<Uint8Array>;
  onProgress?: (progress: PatchProgress) => void;
  signal?: AbortSignal;
  totalBytes?: number;
};

function accessKeyRecord(accessKey: string) {
  if (typeof accessKey !== "string" || accessKey.length === 0) {
    throw new TypeError("The Tailscale auth key must be a non-empty string.");
  }

  // Tokens do not contain whitespace. Rejecting it catches accidental copy and
  // paste errors and keeps the boot-time record deliberately easy to parse.
  if (!/^[!-~]+$/.test(accessKey)) {
    throw new TypeError(
      "The Tailscale auth key must contain only printable ASCII without spaces.",
    );
  }

  const keyBytes = encoder.encode(accessKey);
  if (keyBytes.byteLength > AUTH_KEY_CAPACITY) {
    throw new RangeError(
      `The Tailscale auth key is larger than the ${AUTH_KEY_CAPACITY}-byte slot.`,
    );
  }

  return encoder.encode(
    SLOT_START + accessKey.padEnd(AUTH_KEY_CAPACITY, " ") + SLOT_END,
  );
}

function bytesFrom(chunk: Uint8Array) {
  if (chunk instanceof Uint8Array) return chunk;
  throw new TypeError("The ISO stream must contain byte chunks.");
}

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

function isoStream(source: IsoSource) {
  if (source instanceof Response) {
    if (!source.ok) {
      throw new Error(`ISO download failed with HTTP ${source.status}.`);
    }
    if (!source.body) throw new Error("The ISO response has no body.");
    return source.body;
  }

  if (source instanceof Blob) return source.stream();
  return source;
}

function isoPatcher(
  accessKey: string,
  {
    onProgress,
    totalBytes,
  }: Pick<PatchOptions, "onProgress" | "totalBytes"> = {},
) {
  const replacementBytes = accessKeyRecord(accessKey);
  const overlapSize = placeholderBytes.byteLength - 1;
  let pending = new Uint8Array();
  let inputBytes = 0;
  let matches = 0;

  const stream = new TransformStream({
    transform(chunk, controller) {
      const bytes = bytesFrom(chunk);
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

      onProgress?.({ inputBytes, totalBytes });
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

  return {
    stream,
    result: () => ({ bytesWritten: inputBytes, replacements: matches }),
  };
}

/**
 * Patch an ISO while piping it to a WritableStream.
 *
 * A FileSystemWritableFileStream from showSaveFilePicker() is the ideal
 * destination: the ISO is written directly to disk and never held in full in
 * the browser's JavaScript heap.
 */
export async function patchTailbootIso({
  source,
  accessKey,
  destination,
  onProgress,
  signal,
  totalBytes,
}: PatchOptions) {
  if (typeof destination?.getWriter !== "function") {
    throw new TypeError("destination must be a WritableStream.");
  }

  let patcher;
  try {
    patcher = isoPatcher(accessKey, { onProgress, totalBytes });
  } catch (error) {
    await destination.abort(error);
    throw error;
  }

  await isoStream(source).pipeThrough(patcher.stream).pipeTo(destination, {
    signal,
  });
  return patcher.result();
}
