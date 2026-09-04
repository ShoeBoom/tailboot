import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTH_KEY_PLACEHOLDER,
  patchTailbootIso,
} from "./tailboot-iso.ts";

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);

function chunkedStream(bytes: Uint8Array<ArrayBuffer>, chunkSizes: number[]) {
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

class ChunkedBlob extends Blob {
  readonly data: Uint8Array<ArrayBuffer>;
  readonly chunkSizes: number[];

  constructor(data: Uint8Array<ArrayBuffer>, chunkSizes: number[]) {
    super([data]);
    this.data = data;
    this.chunkSizes = chunkSizes;
  }

  override stream() {
    return chunkedStream(this.data, this.chunkSizes);
  }
}

function memoryDestination() {
  const chunks: Uint8Array[] = [];
  return {
    chunks,
    stream: new WritableStream({
      write: (chunk) => {
        chunks.push(chunk.slice());
      },
    }),
  };
}

function join(chunks: Uint8Array[]) {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

test("keeps the image key file in sync with the browser customizer", async () => {
  const keyFile = await readFile(
    new URL("./image/config/includes.binary/TAILBOOT.KEY", import.meta.url),
    "utf8",
  );
  assert.equal(keyFile, AUTH_KEY_PLACEHOLDER);
});

test("patches across arbitrary chunk boundaries without changing ISO size", async () => {
  const before = "fake ISO header\0";
  const after = "\0fake ISO footer";
  const input = encode(before + AUTH_KEY_PLACEHOLDER + after);
  const output = memoryDestination();
  const progress: number[] = [];

  await patchTailbootIso({
    source: new ChunkedBlob(input, [1, 7, 31, 2]),
    accessKey: "tskey-auth-test-key",
    destination: output.stream,
    onProgress: (inputBytes) => progress.push(inputBytes),
  });

  const patched = join(output.chunks);
  assert.equal(patched.byteLength, input.byteLength);
  assert.match(decode(patched), /tskey-auth-test-key +\n/);
  assert.equal(decode(patched).includes(AUTH_KEY_PLACEHOLDER), false);
  assert.equal(progress.at(-1), input.byteLength);
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
