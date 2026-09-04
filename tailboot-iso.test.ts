import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CONFIG_PLACEHOLDER,
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

test("keeps the image JSON file in sync with the browser customizer", async () => {
  const configFile = await readFile(
    new URL("./image/config/includes.binary/TAILBOOT.JSON", import.meta.url),
    "utf8",
  );
  assert.equal(configFile, CONFIG_PLACEHOLDER);
});

test("patches across arbitrary chunk boundaries without changing ISO size", async () => {
  const before = "fake ISO header\0";
  const after = "\0fake ISO footer";
  const input = encode(before + CONFIG_PLACEHOLDER + after);
  const output = memoryDestination();
  const progress: number[] = [];

  await patchTailbootIso({
    source: new ChunkedBlob(input, [1, 7, 31, 2]),
    config: { authKey: "tskey-auth-test-key" },
    destination: output.stream,
    onProgress: (inputBytes) => progress.push(inputBytes),
  });

  const patched = join(output.chunks);
  assert.equal(patched.byteLength, input.byteLength);
  assert.equal(decode(patched.subarray(0, encode(before).byteLength)), before);
  assert.equal(decode(patched.subarray(-encode(after).byteLength)), after);
  assert.deepEqual(JSON.parse(decode(patched.subarray(
    encode(before).byteLength, patched.byteLength - encode(after).byteLength,
  ))), { authKey: "tskey-auth-test-key" });
  assert.equal(decode(patched).includes(CONFIG_PLACEHOLDER), false);
  assert.equal(progress.at(-1), input.byteLength);
});

test("rejects images without exactly one empty slot", async () => {
  for (const contents of ["no slot", "~".repeat(512) + "\n", CONFIG_PLACEHOLDER.repeat(2)]) {
    const output = memoryDestination();
    await assert.rejects(
      patchTailbootIso({
        source: new Blob([contents]),
        config: { authKey: "tskey-auth-test-key" },
        destination: output.stream,
      }),
      /slot/,
    );
  }
});

test("round-trips Unicode and escaped credentials in a fixed-size JSON record", async () => {
  const config = {
    authKey: "tskey-auth-test-key",
    wifi: { ssid: 'Café "网络" \\ 📶', password: ' spaces " \\ $() `secret` ' },
  };
  const output = memoryDestination();
  await patchTailbootIso({
    source: chunkedStream(encode(CONFIG_PLACEHOLDER), [4094, 1]),
    config,
    destination: output.stream,
  });
  const patched = join(output.chunks);
  assert.equal(patched.byteLength, encode(CONFIG_PLACEHOLDER).byteLength);
  assert.deepEqual(JSON.parse(decode(patched)), config);
});

test("accepts an exact fit and aborts oversized UTF-8 configuration without writing", async () => {
  const capacity = encode(CONFIG_PLACEHOLDER).byteLength - 1;
  const overhead = encode(JSON.stringify({ authKey: "" })).byteLength;
  const exactFit = { authKey: "x".repeat(capacity - overhead) };
  const output = memoryDestination();
  await patchTailbootIso({
    source: new Blob([CONFIG_PLACEHOLDER]),
    config: exactFit,
    destination: output.stream,
  });
  assert.deepEqual(JSON.parse(decode(join(output.chunks))), exactFit);

  for (const authKey of [exactFit.authKey + "x", "é".repeat(capacity / 2)]) {
    let aborted = false;
    let written = false;
    await assert.rejects(patchTailbootIso({
      source: new Blob([CONFIG_PLACEHOLDER]),
      config: { authKey },
      destination: new WritableStream({
        write() { written = true; },
        abort() { aborted = true; },
      }),
    }), /exceeds/);
    assert.equal(aborted, true);
    assert.equal(written, false);
  }
});

test("aborts the destination on a mid-download network failure", async () => {
  let aborted = false;
  let pulls = 0;
  await assert.rejects(patchTailbootIso({
    source: new ReadableStream({
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(encode(CONFIG_PLACEHOLDER));
        else controller.error(new Error("connection lost"));
      },
    }),
    config: { authKey: "tskey-auth-test-key" },
    destination: new WritableStream({ abort() { aborted = true; } }),
  }), /connection lost/);
  assert.equal(aborted, true);
});
