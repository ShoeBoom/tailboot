# Tailboot

Tailboot is a headless Debian 13 live image that automatically joins a
Tailscale network and enables Tailscale SSH. It is intended to be flashed to a
USB drive and booted directly; it is not an installer.

## How customization works

The base ISO contains a fixed-size placeholder in the uncompressed
`/TAILBOOT.KEY` file. The browser replaces that record without changing the
length of the image. At boot, the system passes the file directly to
`tailscale up --ssh`.

The Astro Worker streams the current ISO from its fixed GitHub Release URL.
Callers cannot supply an upstream URL, and cross-site browser requests are
rejected, so the endpoint cannot be repurposed as an open proxy. The Tailscale
key never reaches the Worker.

The page and proxy are deployed together and share the selected release's
filename and byte count. The browser requires a complete download and exactly
one key slot before completing the customized file. A page left open across a
release change asks the user to reload instead of downloading a different ISO.

Browsers with `showSaveFilePicker` stream the customized image directly to
disk. Other browsers, including mobile browsers without that API, hold the
customized image in memory and then start a normal download. That fallback
therefore needs enough available memory for the ISO.

## Website

All website code and configuration is contained in [`site/`](site/). The page
is [`site/src/pages/index.astro`](site/src/pages/index.astro), the server-side
ISO endpoint is [`site/src/iso-proxy.ts`](site/src/iso-proxy.ts), and the
browser-side streaming customizer is
[`site/src/tailboot-iso.ts`](site/src/tailboot-iso.ts).

```sh
pnpm install
pnpm dev
```

The development server deliberately has no release ISO configured. Every
production build reads GitHub's latest published release and requires both its
ISO and checksum to be uploaded. Astro bakes the release URL and ISO size into
the page and Worker. A missing or incomplete release fails the build, leaving
the current deployment active. Builds do not depend on locally fetched Git tags
or require website changes to have their own ISO release.

## Building the image

On a Debian 13 build host with `live-build` and `curl` installed:

```sh
sudo ./scripts/build-iso.sh tailboot-local-amd64.iso
```

The result is written to `dist/`. Builds use Tailscale's official Debian
repository and Debian's `minbase` bootstrap. The image adds only certificates,
common network firmware, NetworkManager, sudo, and Tailscale; install other
tools with APT after the machine connects.

The ISO's internal media-check manifest is disabled because customizing
`/TAILBOOT.KEY` necessarily changes that file. Every GitHub release includes a
separate SHA-256 file for verifying the unmodified base ISO.

## Releases and Cloudflare Workers

[`release.yml`](.github/workflows/release.yml) runs when a CalVer tag is pushed,
when started manually, and on the first day of each month at 04:17 UTC.
Scheduled and manual runs create a UTC CalVer tag such as
`v2026.09.04.031500`; pushed tags must use the same `vYYYY.MM.DD.HHMMSS` format.

1. GitHub Actions builds and verifies the ISO, then publishes it and its
   checksum to a GitHub Release.
2. Only after that succeeds, Actions sends an empty `POST` to a Cloudflare
   Workers Builds deploy hook.
3. Cloudflare checks out the hook's configured branch. The build selects the
   latest published release once and deploys the page and proxy together.

The hook does not carry a tag, URL, or asset name. Reruns never overwrite an
existing ISO asset. A failed ISO build does not trigger deployment, and a failed
Worker build leaves the existing deployment active. Cloudflare's normal
push-triggered builds can deploy website changes using the existing published
ISO; the post-release hook updates the site after a new ISO is published.

Configure the Cloudflare project with `site` as its root directory. Set the
build command to `pnpm build` and the deploy command to `pnpm exec wrangler deploy`.
Create a deploy hook for the release branch, then store its complete
URL as the GitHub Actions repository secret `CLOUDFLARE_DEPLOY_HOOK_URL`.

The deploy-hook URL is a bearer credential: anyone who knows it can trigger a
build of that one configured branch. Do not commit it, print it, or put it in a
client-side variable. GitHub Actions injects it only into the deploy step and
sends no request body. If it is exposed, delete the hook in Cloudflare, create
a new one, and replace the GitHub secret.

## Credential lifecycle

Use a reusable, ephemeral Tailscale auth key with a 90-day expiry. When it
expires, generate another key and customize a new ISO. Every boot creates a new
ephemeral Tailscale machine identity. The customized image contains the key in
plain text, so keep it private.

Run the unit tests with:

```sh
pnpm test
```

Run the complete production check (requires access to GitHub's release API) with:

```sh
pnpm build
```

Use `pnpm preview` to build and test the page and ISO proxy together in the local
Cloudflare runtime. Downloads use the published ISO, which can be large.
