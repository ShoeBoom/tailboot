# Tailboot

Tailboot is a headless Debian 13 live image that automatically joins a
Tailscale network and enables Tailscale SSH. It is intended to be flashed to a
USB drive and booted directly; it is not an installer.

## Logging in

Connect with `ssh tailboot@tailboot` (or use the device's Tailscale IP if its
name differs). Tailscale authenticates the SSH connection; no local password
is needed. Your tailnet policy must allow both traffic to port 22 and Tailscale
SSH to the `tailboot` user. `autogroup:nonroot` includes this account, but
excludes `root`. Use `sudo -i` after connecting for a root shell.

The local console logs in automatically as `tailboot`. If prompted for a
login, the username is `tailboot` and Debian Live's default password is `live`.
The account has passwordless sudo.

## How customization works

The base ISO contains a fixed-size placeholder in the uncompressed
`/TAILBOOT.JSON` file. The browser-side TypeScript module replaces that 4096-byte
record with UTF-8 JSON padded with spaces and a final newline, without changing
the length of the image. Configurations larger than the slot are rejected.

```json
{
  "authKey": "tskey-auth-…",
  "wifi": {
    "ssid": "My Wi-Fi",
    "password": "my-wifi-password"
  }
}
```

Omit `wifi` to use Ethernet only. The customizer supports one WPA2/WPA3 Personal
network. At boot, `tailboot-configure.service` extracts the auth key into a
root-only file under `/run/tailboot` for `tailscale up --ssh`. If Wi-Fi is
configured, it uses `nmcli --offline` to create a root-only connection profile
under `/run/NetworkManager/system-connections` before NetworkManager starts.
NetworkManager handles connecting and reconnecting. Ethernet is preferred;
the configured Wi-Fi network is the fallback when Ethernet is disconnected or
has no default route. Both connections can stay active. We leave route metrics
at NetworkManager's defaults, which favor Ethernet, without custom switching
logic. This does not detect an upstream internet outage on an otherwise
connected Ethernet network.

Wi-Fi profile generation is best-effort,
with a 10-second timeout (and forced termination one second later if needed);
failures are logged without blocking auth-key setup or Ethernet startup.
Tailscale does not wait for Wi-Fi scanning or authentication to finish: its join
service retries until internet connectivity is available. These files live in
RAM; Tailscale state is never restored between boots.

The site downloads its pinned ISO through the standalone [Cloudflare proxy](proxy/)
and customizes it locally. The proxy allows browser requests from the configured
site origin and forwards only Tailboot release ISOs. It needs no redeployment
when a new ISO is published.

Browsers with a file-system writer stream directly to disk. Other browsers hold
the customized ISO in memory before downloading it. The customizer requires
exactly one JSON slot before completing the file. Credentials never reach the
proxy. The JSON customizer requires a newly built base ISO; older images with
`/TAILBOOT.KEY` are incompatible.

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
common network firmware, NetworkManager, wpasupplicant, jq, sudo, Tailscale, and `user-setup`
for the live login account; install other tools with APT after the machine
connects. Because APT recommends are disabled, `user-setup` must be listed
explicitly, as must `wpasupplicant` for Wi-Fi. Release verification checks these
dependencies and the installed configuration script and enabled services.
It also runs the configuration script in the build chroot with and without
Wi-Fi, checking credential escaping and file permissions using Debian's nmcli.
Invalid Wi-Fi settings, a failed profile writer, and a stuck profile writer
must all leave auth-key setup successful without installing a partial profile.

The ISO's internal media-check manifest is disabled because customizing
`/TAILBOOT.JSON` necessarily changes that file. Every GitHub release includes a
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
ephemeral Tailscale machine identity. The customized image contains the auth key
and any Wi-Fi credentials in plain text, so keep it private.

Run the website checks with the release variables above set:

```sh
pnpm test
pnpm build
```

Check the independent proxy with `pnpm --dir proxy check`.
