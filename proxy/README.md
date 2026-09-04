# Tailboot release proxy

A standalone Cloudflare Worker that streams Tailboot release ISOs from GitHub.
It has no runtime dependencies, storage, release metadata, or imports from the
rest of this repository. It can be developed and deployed independently of the
website and ISO builds.

## Interface

`GET /vYYYY.MM.DD.HHMMSS` forwards to:

```text
https://github.com/ShoeBoom/tailboot/releases/download/<tag>/tailboot-<tag>-amd64.iso
```

The upstream repository and filename pattern are fixed. Callers cannot choose
another host, repository, or asset. The Worker supports `GET`, `HEAD`, and CORS
preflight requests. It streams the full ISO without buffering it, forwarding
credentials, or forwarding range requests.

## Browser access

Set `vars.ALLOWED_ORIGIN` in [`wrangler.jsonc`](wrangler.jsonc) to the site's
exact origin. The default is `https://shoeboom.github.io`. The Worker rejects
missing, opaque (`null`), and other origins before making an upstream request.
Allowed requests receive an exact `Access-Control-Allow-Origin` header,
including when the upstream fails. It does not allow credentialed requests.

This prevents other origins from using the proxy directly in a browser.
Origins contain no path: all pages hosted at `https://shoeboom.github.io` share
that origin. CORS is not authentication; non-browser clients can spoof the
`Origin` header. No secret can be kept in a public static website to prevent
that.

## Deployment

From this directory:

```sh
pnpm install
pnpm types
pnpm deploy
```

The deploy command runs type checks and tests before invoking Wrangler. Use
`pnpm exec wrangler login` first if the CLI is not already authenticated.
The configured Worker name is `tailboot-proxy`.

Set the website's `TAILBOOT_PROXY_URL` variable to the origin Wrangler reports,
such as `https://tailboot-proxy.YOUR-SUBDOMAIN.workers.dev`. No release tag is
configured on the Worker, and publishing an ISO requires no Worker deployment.
Redeploy only when proxy code or configuration changes. Regenerate types with
`pnpm types` after changing the configuration.

## Local development

From this directory, allow the local static site's origin:

```sh
pnpm dev --port 8787 --var ALLOWED_ORIGIN:http://localhost:4321
```

In another terminal, build and preview the site from the repository root with
an existing release tag and its published byte count:

```sh
TAILBOOT_RELEASE=v2026.09.04.153117 \
TAILBOOT_ISO_SIZE=895483904 \
TAILBOOT_PROXY_URL=http://localhost:8787 \
pnpm build
pnpm preview
```

Open `http://localhost:4321/tailboot/`. Downloads use the real published ISO.
The site's plain development mode leaves downloading disabled.

To check the proxy without downloading the ISO:

```sh
curl --head \
  --header 'Origin: http://localhost:4321' \
  http://localhost:8787/v2026.09.04.153117
```

Run `pnpm check` for type checks and unit tests. The unit tests use fake upstream
responses and do not download release assets.
