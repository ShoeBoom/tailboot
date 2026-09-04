# Tailboot release proxy

A standalone Cloudflare Worker with no runtime dependencies, storage, or
imports from the website or image build. It needs no redeployment for new ISOs.

`GET /vYYYY.MM.DD.HHMMSS` streams:

```text
https://github.com/ShoeBoom/tailboot/releases/download/<tag>/tailboot-<tag>-amd64.iso
```

The repository and filename pattern are fixed. Callers cannot choose another
upstream or asset. The Worker supports GET, HEAD, and CORS preflight requests;
it forwards no client credentials or range headers.

## Configuration and deployment

Set `vars.ALLOWED_ORIGIN` in [wrangler.jsonc](wrangler.jsonc) to the website's
origin. It defaults to `https://shoeboom.github.io`. Requests with a different,
missing, or opaque (`null`) origin are rejected before contacting GitHub.

CORS limits browser access, not non-browser clients that can spoof `Origin`.
All pages under `https://shoeboom.github.io` share the same origin.

From this directory:

```sh
pnpm install
pnpm types    # Regenerate after configuration changes.
pnpm deploy   # Runs checks and tests before deploying.
```

If needed, authenticate with `pnpm exec wrangler login` first. Set the GitHub
Actions repository variable `TAILBOOT_PROXY_URL` to the deployed Worker origin.
The release workflow builds the website's ISO URL from this value and its tag.

## Local development

```sh
pnpm dev --port 8787 --var ALLOWED_ORIGIN:http://localhost:4321
```

Use the [website's build instructions](../README.md#website) with
`PUBLIC_TAILBOOT_ISO_URL=http://localhost:8787/<release-tag>`, then run
`pnpm preview` at the repository root and open `http://localhost:4321/tailboot/`.
Downloads use the published ISO.

Run `pnpm check` here for type checks and unit tests. Tests use fake upstream
responses and do not download release assets.
