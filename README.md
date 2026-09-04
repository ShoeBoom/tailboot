# Tailboot

Tailboot is a headless Debian 13 live image that automatically joins a
Tailscale network and enables Tailscale SSH. It is intended to be flashed to a
USB drive and booted directly; it is not an installer.

## How customization works

The base ISO contains a fixed-size placeholder in the uncompressed
`/TAILBOOT.KEY` file. The browser-side TypeScript module replaces that record
without changing the length of the image. At boot, the system passes that file
directly to `tailscale up --ssh`.

The site downloads its pinned ISO through the standalone [Cloudflare proxy](proxy/)
and customizes it locally. The proxy allows browser requests from the configured
site origin and forwards only Tailboot release ISOs. It needs no redeployment
when a new ISO is published.

Browsers with a file-system writer stream directly to disk. Other browsers hold
the customized ISO in memory before downloading it. The customizer requires
exactly one key slot before completing the file. The key never reaches the proxy.

## Website

The website is hosted on GitHub Pages at <https://tailboot.download/>.

The single-page Astro site is in [`src/pages/index.astro`](src/pages/index.astro)
and the streaming customizer is [`tailboot-iso.ts`](tailboot-iso.ts).

```sh
pnpm install
pnpm dev
```

For a production build, provide the release metadata:

```sh
PUBLIC_TAILBOOT_ISO_NAME="tailboot-v2026.09.04.153117-amd64.iso" \
PUBLIC_TAILBOOT_RELEASE="v2026.09.04.153117" \
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
2. Build Astro with that exact release's metadata.
3. Deploy the static result to GitHub Pages.

Jobs run in that order. The existing Pages deployment remains active if either
the new ISO or site build fails, so it continues using the previous ISO until a
new website deployment succeeds. Reruns never overwrite an existing ISO asset.
The timestamp permits multiple releases on the same day without maintaining a
version counter.

Domain and deployment setup:

1. Deploy the [proxy](proxy/README.md) with `ALLOWED_ORIGIN` set to
   `https://tailboot.download`. If using Cloudflare Builds, select `main` as
   the production branch and deploy the merged commit.
2. In the repository's **Settings → Pages**, select **GitHub Actions** as the
   source and save `tailboot.download` as the custom domain.
3. In Cloudflare DNS, point the apex (`@`) to GitHub Pages using these four
   **A** records, each with **DNS only** (gray cloud):

   | Name | IPv4 address |
   | --- | --- |
   | `@` | `185.199.108.153` |
   | `@` | `185.199.109.153` |
   | `@` | `185.199.110.153` |
   | `@` | `185.199.111.153` |

   Replace conflicting apex address records; leave `proxy.tailboot.download`
   pointing to the Worker.
4. Enable **Enforce HTTPS** in GitHub Pages once the certificate is ready.
5. After merging, run **Build Tailboot release** on `main` to publish the site
   with root-relative asset paths. Merging alone does not deploy GitHub Pages.

Coordinate the proxy deployment with the domain switch: it accepts only the
configured website origin. The old GitHub Pages origin is no longer allowed.
The custom domain is managed in GitHub settings; this Actions deployment does
not use a `CNAME` file. See GitHub's [custom domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

The website downloads from `https://proxy.tailboot.download/<release-tag>`.
No proxy URL repository variable or Cloudflare deploy hook is needed.

## Credential lifecycle

Use a reusable, ephemeral Tailscale auth key with a 90-day expiry. When it
expires, generate another key and customize a new ISO. Every boot creates a new
ephemeral Tailscale machine identity. The customized image contains the key in
plain text, so keep it private.

Run the website checks with the release variables above set:

```sh
pnpm test
pnpm build
```

Check the independent proxy with `pnpm --dir proxy check`.
