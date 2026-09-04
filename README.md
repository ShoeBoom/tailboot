# Tailboot

<img width="435" height="698" alt="Tailboot logo" src="https://github.com/user-attachments/assets/7d94d7f5-39bc-45f2-abe1-586bdd395f78" />

`tailboot-iso.js` is a dependency-free browser module that downloads the
latest release ISO and embeds a Tailscale auth key without loading the entire
image into JavaScript memory.

The base image must include the exported `AUTH_KEY_PLACEHOLDER` exactly once as
an uncompressed `/TAILBOOT.KEY` file in the ISO9660 root. At boot, Tailboot can
read that file from `/run/live/medium/TAILBOOT.KEY`, extract the text between
the `BEGIN` and `END` lines, and trim its trailing spaces. Do not put this file
inside the compressed SquashFS.

## Browser usage

Call this from a user gesture because browsers require one to show a save-file
picker:

```js
import { patchLatestTailbootIso } from "./tailboot-iso.js";

const file = await showSaveFilePicker({
  suggestedName: "tailboot.iso",
  types: [
    {
      description: "Tailboot ISO",
      accept: { "application/x-iso9660-image": [".iso"] },
    },
  ],
});

const destination = await file.createWritable();
const result = await patchLatestTailbootIso({
  accessKey: document.querySelector("#tailscale-key").value,
  destination,
  onProgress: ({ inputBytes, totalBytes }) => {
    console.log(totalBytes ? inputBytes / totalBytes : inputBytes);
  },
});

console.log(`Wrote ${result.fileName} from release ${result.releaseTag}`);
```

`patchTailbootIso` also accepts an existing `Blob`, `Response`, or
`ReadableStream` as its source. Output is always streamed to a `WritableStream`.
The image length never changes, so its ISO and hybrid-boot offsets remain
intact.

Use a short-lived, one-off Tailscale auth key. The customized image contains
the credential in plain text and must be treated as sensitive.
