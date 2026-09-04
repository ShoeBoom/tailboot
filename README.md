# Tailboot

Tailboot is a headless Debian 13 live image that automatically joins a
Tailscale network and enables Tailscale SSH. It is intended to be flashed to a
USB drive and booted directly; it is not an installer.

## How customization works

The base ISO contains a fixed-size placeholder in the uncompressed
`/TAILBOOT.KEY` file. The browser replaces that record without changing the
length of the image. At boot, the system passes the file directly to
`tailscale up --ssh`.

The static website on GitHub Pages downloads an exact release through a small
Cloudflare Worker. The Worker streams only Tailboot release ISOs and allows
browser requests from the configured website origin. It has no release state
and needs no redeployment when a new ISO is published. The key is inserted
locally in the browser and never sent to GitHub or the proxy.

The browser requires the published byte count and exactly one key slot before
completing the customized file. Older open tabs can keep downloading their
original release as long as its GitHub asset remains available.

Browsers with `showSaveFilePicker` stream the customized image directly to
disk. Other browsers, including mobile browsers without that API, hold the
customized image in memory and then start a normal download. That fallback
therefore needs enough available memory for the ISO.

## Website

[`site/`](site/) is a static Astro project. Its browser customizer is
[`site/src/tailboot-iso.ts`](site/src/tailboot-iso.ts). The standalone Worker in
[`proxy/`](proxy/) has its own configuration, tests, and deployment commands;
it imports no website or image-building code.

```sh
pnpm install
pnpm dev
```

Development mode shows the form without a release configured. Production
builds require explicit metadata; they never look up the latest release:

```sh
TAILBOOT_RELEASE=v2026.09.04.153117 \
TAILBOOT_ISO_SIZE=895483904 \
TAILBOOT_PROXY_URL=https://tailboot-proxy.YOUR-SUBDOMAIN.workers.dev \
pnpm build
pnpm preview
```

Use the tag and byte count of the published ISO. `TAILBOOT_PROXY_URL` is the
proxy's origin, without a path. The site constructs the download URL as
`<proxy-origin>/<release-tag>` and derives the ISO filename from the tag.
Missing or invalid metadata fails the build. For local downloads, follow the
[proxy development instructions](proxy/README.md#local-development).

Run both packages' unit tests with `pnpm test`. Run the Worker's type checks and
tests with `pnpm --dir proxy check`.

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

## Releases and GitHub Pages

[`release.yml`](.github/workflows/release.yml) runs when a CalVer tag is pushed,
when started manually, and on the first day of each month at 04:17 UTC.
Scheduled and manual runs create a UTC CalVer tag such as
`v2026.09.04.031500`; pushed tags must use the same `vYYYY.MM.DD.HHMMSS` format.

1. Build and verify the ISO, then publish it and its checksum to GitHub Releases.
2. Build the static website from the same source commit, passing the exact
   release tag, published ISO byte count, and configured proxy origin.
3. Deploy the resulting site to GitHub Pages only after that build succeeds.

Reruns never overwrite an existing ISO asset. When reusing an existing asset,
the workflow reads its published size. A failed ISO or website build leaves the
previous Pages deployment active. Cloudflare is not part of this release
workflow, and no deploy hook is needed.

### One-time hosting setup

1. Deploy the [standalone proxy](proxy/README.md#deployment). Set its
   `ALLOWED_ORIGIN` to `https://shoeboom.github.io` for the current Pages URL.
2. In GitHub **Settings > Secrets and variables > Actions > Variables**, set
   the repository variable `TAILBOOT_PROXY_URL` to the deployed proxy origin.
   This is a public URL, not a secret.
3. In **Settings > Pages**, select **GitHub Actions** as the deployment source.
   If the `github-pages` environment restricts deployments, allow the release
   branch and `v*` tags used by this workflow.
4. Run the release workflow to publish the site. The configured Pages URL is
   `https://shoeboom.github.io/tailboot/`.

If migrating from the combined Cloudflare site, disconnect its automatic site
builds. The old `CLOUDFLARE_DEPLOY_HOOK_URL` secret is no longer used.

## Credential lifecycle

Use a reusable, ephemeral Tailscale auth key with a 90-day expiry. When it
expires, generate another key and customize a new ISO. Every boot creates a new
ephemeral Tailscale machine identity. The customized image contains the key in
plain text, so keep it private.
