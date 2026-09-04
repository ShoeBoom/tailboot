# Tailboot

Tailboot is a headless Debian 13 live image that automatically joins a
Tailscale network and enables Tailscale SSH. It is intended to be flashed to a
USB drive and booted directly; it is not an installer.

## How customization works

The base ISO contains a fixed-size placeholder in the uncompressed
`/TAILBOOT.KEY` file. The browser-side TypeScript module replaces that record
without changing the length of the image. The live system reads it from
`/run/live/medium/TAILBOOT.KEY`, copies the key briefly to a mode-`0600` file in
`/run`, and passes its path to `tailscale up --ssh`.

GitHub release downloads do not expose the cross-origin browser headers needed
for a direct `fetch` from GitHub Pages. The site therefore links to its pinned
base ISO, then streams the user-selected download through the browser's
file-system writer. Only the current file chunk and a small marker overlap are
held in the JavaScript heap.

## Website

The single-page Astro site is in [`src/pages/index.astro`](src/pages/index.astro)
and the streaming customizer is [`tailboot-iso.ts`](tailboot-iso.ts).

```sh
pnpm install
pnpm dev
```

For a production build, bake in one specific release asset:

```sh
PUBLIC_TAILBOOT_ISO_URL="https://github.com/ShoeBoom/tailboot/releases/download/v1.0.0/tailboot-v1.0.0-amd64.iso" \
PUBLIC_TAILBOOT_ISO_NAME="tailboot-v1.0.0-amd64.iso" \
PUBLIC_TAILBOOT_RELEASE="v1.0.0" \
pnpm build
```

There is deliberately no runtime “latest release” lookup in the website. A
deployed site always points to the immutable ISO URL baked into that site
build.

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

1. Build the ISO and publish it plus its SHA-256 checksum to the GitHub release.
2. Build Astro with that exact release asset URL.
3. Deploy the static result to GitHub Pages.

Jobs run in that order. The existing Pages deployment remains active if either
the new ISO or site build fails, so it continues using the previous ISO until a
new website deployment succeeds. Reruns never overwrite an existing ISO asset.
The timestamp permits multiple releases on the same day without maintaining a
version counter.

Before the first deployment, select **GitHub Actions** as the Pages source in
the repository settings.

## Credential lifecycle

The customized image contains the Tailscale auth key in plain text and must be
treated as sensitive. A one-off key is suitable for a one-time boot. A
stateless live image that must join again after every reboot requires a reusable
key; keep its lifetime and permissions as narrow as possible. Tagged and
pre-approved keys are useful for unattended machines when permitted by the
tailnet policy.

Run all checks with:

```sh
pnpm test
pnpm build
```
