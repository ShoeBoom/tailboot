import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_KEY_CAPACITY,
  AUTH_KEY_PLACEHOLDER,
  findLatestIsoRelease,
  patchTailbootIso,
} from "./tailboot-iso.js";

const encode = (value) => new TextEncoder().encode(value);
const decode = (value) => new TextDecoder().decode(value);

function chunkedStream(bytes, chunkSizes) {
  let offset = 0;
  let chunk = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === bytes.byteLength) return controller.close();
      const size = chunkSizes[chunk % chunkSizes.length];
      controller.enqueue(bytes.slice(offset, offset + size));
      offset = Math.min(offset + size, bytes.byteLength);
      chunk += 1;
    },
  });
}

function memoryDestination() {
  const chunks = [];
  return {
    chunks,
    stream: new WritableStream({ write: (chunk) => chunks.push(chunk.slice()) }),
  };
}

function join(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

test("patches across arbitrary chunk boundaries without changing ISO size", async () => {
  const before = "fake ISO header\0";
  const after = "\0fake ISO footer";
  const input = encode(before + AUTH_KEY_PLACEHOLDER + after);
  const output = memoryDestination();
  const progress = [];

  const result = await patchTailbootIso({
    source: chunkedStream(input, [1, 7, 31, 2]),
    accessKey: "tskey-auth-test-key",
    destination: output.stream,
    totalBytes: input.byteLength,
    onProgress: (event) => progress.push(event),
  });

  const patched = join(output.chunks);
  assert.equal(patched.byteLength, input.byteLength);
  assert.match(decode(patched), /BEGIN\ntskey-auth-test-key +\nTAILBOOT/);
  assert.equal(decode(patched).includes("~".repeat(AUTH_KEY_CAPACITY)), false);
  assert.deepEqual(result, { bytesWritten: input.byteLength, replacements: 1 });
  assert.deepEqual(progress.at(-1), {
    inputBytes: input.byteLength,
    totalBytes: input.byteLength,
  });
});

test("rejects images without exactly one empty slot", async () => {
  for (const contents of ["no slot", AUTH_KEY_PLACEHOLDER.repeat(2)]) {
    const output = memoryDestination();
    await assert.rejects(
      patchTailbootIso({
        source: new Blob([contents]),
        accessKey: "tskey-auth-test-key",
        destination: output.stream,
      }),
      /slot/,
    );
  }
});

test("rejects unsafe or oversized key values", async () => {
  for (const accessKey of ["", " key", "key\n", "x".repeat(AUTH_KEY_CAPACITY + 1)]) {
    const output = memoryDestination();
    await assert.rejects(
      patchTailbootIso({
        source: new Blob([AUTH_KEY_PLACEHOLDER]),
        accessKey,
        destination: output.stream,
      }),
    );
  }
});

test("selects the only ISO in the latest GitHub release", async () => {
  const fetch = async () =>
    new Response(
      JSON.stringify({
        tag_name: "v1.2.3",
        assets: [
          { name: "checksums.txt", browser_download_url: "ignored", size: 10 },
          {
            name: "tailboot.iso",
            browser_download_url: "https://example.test/tailboot.iso",
            size: 123,
          },
        ],
      }),
    );

  assert.deepEqual(
    await findLatestIsoRelease({ repository: "owner/project", fetch }),
    {
      fileName: "tailboot.iso",
      downloadUrl: "https://example.test/tailboot.iso",
      size: 123,
      releaseTag: "v1.2.3",
    },
  );
});

