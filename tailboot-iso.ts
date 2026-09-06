import { createIsoPatcher } from "./tailboot-iso-core.ts";

export { CONFIG_PLACEHOLDER } from "./tailboot-iso-core.ts";

export type TailbootConfig = {
  authKey: string;
  wifi?: { ssid: string; password: string };
};

type PatchOptions = {
  source: Blob | ReadableStream<Uint8Array>;
  config: TailbootConfig;
  configOffset: number;
  destination: WritableStream<Uint8Array>;
  onProgress?: (inputBytes: number) => void;
};

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
    .pipeThrough(new TransformStream(createIsoPatcher({
      configBytes: new TextEncoder().encode(JSON.stringify(options.config)),
      configOffset: options.configOffset,
      onProgress: options.onProgress,
    })))
    .pipeTo(destination);
}
