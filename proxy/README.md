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

The custom domain `proxy.tailboot.download` is fixed in
[wrangler.jsonc](wrangler.jsonc). Deploy to the Cloudflare account that manages
the active `tailboot.download` zone. Cloudflare provisions DNS and TLS for the
[Worker custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Set `vars.ALLOWED_ORIGIN` in [wrangler.jsonc](wrangler.jsonc) to the website's
origin. It defaults to `https://tailboot.download`. Requests with a different,
missing, or opaque (`null`) origin are rejected before contacting GitHub.

CORS limits browser access, not non-browser clients that can spoof `Origin`.

From this directory:

```sh
yarn install
yarn types    # Regenerate after configuration changes.
yarn deploy   # Runs checks and tests before deploying.
```

If needed, authenticate with `yarn wrangler login` first. The website uses
`https://proxy.tailboot.download/<release-tag>` directly; no GitHub Actions
variable is needed for the proxy URL.

## Local development

```sh
yarn dev --port 8787 --var ALLOWED_ORIGIN:http://localhost:4321
```

Check a published release locally without downloading the ISO:

```sh
curl --head -H 'Origin: http://localhost:4321' \
  http://localhost:8787/v2026.09.04.153117
```

Run `yarn check` here for type checks and unit tests. Tests use fake upstream
responses and do not download release assets.
