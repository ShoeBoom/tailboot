/**
 * Browser-side Tailboot ISO customizer.
 *
 * The base ISO must contain AUTH_KEY_PLACEHOLDER exactly once in an
 * uncompressed file. The recommended location is /TAILBOOT.KEY in the ISO9660
 * root. Keep it outside the live system's SquashFS: changing compressed data
 * in place would corrupt the filesystem.
 */

const encoder = new TextEncoder();

export const DEFAULT_REPOSITORY = "ShoeBoom/tailboot";
export const AUTH_KEY_CAPACITY = 512;

const SLOT_START = "TAILBOOT_TAILSCALE_AUTH_KEY_V1_BEGIN\n";
const SLOT_END = "\nTAILBOOT_TAILSCALE_AUTH_KEY_V1_END\n";
const EMPTY_SLOT_BYTE = "~";

/** Write this exact string to /TAILBOOT.KEY when building the base ISO. */
export const AUTH_KEY_PLACEHOLDER =
  SLOT_START + EMPTY_SLOT_BYTE.repeat(AUTH_KEY_CAPACITY) + SLOT_END;

const placeholderBytes = encoder.encode(AUTH_KEY_PLACEHOLDER);

function accessKeyRecord(accessKey) {
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

function bytesFrom(chunk) {
  if (chunk instanceof Uint8Array) return chunk;
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  throw new TypeError("The ISO stream must contain byte chunks.");
}

function concatBytes(left, right) {
  if (left.byteLength === 0) return right;
  const joined = new Uint8Array(left.byteLength + right.byteLength);
  joined.set(left);
  joined.set(right, left.byteLength);
  return joined;
}

function indexOfBytes(haystack, needle, fromIndex = 0) {
  const lastStart = haystack.byteLength - needle.byteLength;

  outer: for (let index = fromIndex; index <= lastStart; index += 1) {
    for (let offset = 0; offset < needle.byteLength; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }

  return -1;
}

function isoStream(source) {
  // Structural checks also accept streams and blobs created in another frame.
  if (typeof source?.getReader === "function") return source;
  if (typeof source?.stream === "function") return source.stream();
  if (typeof Response !== "undefined" && source instanceof Response) {
    if (!source.ok) {
      throw new Error(`ISO download failed with HTTP ${source.status}.`);
    }
    if (!source.body) throw new Error("The ISO response has no body.");
    return source.body;
  }

  throw new TypeError("source must be a Blob, Response, or ReadableStream.");
}

function isoPatcher(accessKey, { onProgress, totalBytes } = {}) {
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
}) {
  if (typeof destination?.getWriter !== "function") {
    throw new TypeError("destination must be a WritableStream.");
  }

  const patcher = isoPatcher(accessKey, { onProgress, totalBytes });
  await isoStream(source).pipeThrough(patcher.stream).pipeTo(destination, {
    signal,
  });
  return patcher.result();
}

/** Resolve the single .iso asset from a repository's latest GitHub release. */
export async function findLatestIsoRelease({
  repository = DEFAULT_REPOSITORY,
  fetch: fetchImpl = globalThis.fetch,
  signal,
} = {}) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new TypeError('repository must have the form "owner/name".');
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required.");
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/releases/latest`,
    {
      headers: { Accept: "application/vnd.github+json" },
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed with HTTP ${response.status}.`);
  }

  const release = await response.json();
  const assets = release.assets?.filter(
    (asset) =>
      typeof asset.name === "string" &&
      asset.name.toLowerCase().endsWith(".iso") &&
      typeof asset.browser_download_url === "string",
  );

  if (assets?.length !== 1) {
    throw new Error(
      `The latest GitHub release must contain exactly one .iso asset; found ${assets?.length ?? 0}.`,
    );
  }

  const [asset] = assets;
  return {
    fileName: asset.name,
    downloadUrl: asset.browser_download_url,
    size: typeof asset.size === "number" ? asset.size : undefined,
    releaseTag: release.tag_name,
  };
}

/** Look up, download, patch, and stream the latest release ISO. */
export async function patchLatestTailbootIso({
  repository = DEFAULT_REPOSITORY,
  accessKey,
  destination,
  onProgress,
  signal,
  fetch: fetchImpl = globalThis.fetch,
}) {
  const asset = await findLatestIsoRelease({
    repository,
    fetch: fetchImpl,
    signal,
  });
  const response = await fetchImpl(asset.downloadUrl, { signal });
  const result = await patchTailbootIso({
    source: response,
    accessKey,
    destination,
    onProgress,
    signal,
    totalBytes: asset.size,
  });

  return { ...asset, ...result };
}
