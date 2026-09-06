<h1 align="center">
  <img src="site/public/logo.svg" alt="Tailboot" width="420">
</h1>

<p align="center">
  <strong>Use Tailboot to start Debian and connect to a computer with Tailscale SSH.</strong>
</p>

<p align="center">
  <a href="https://tailboot.download/"><strong>Create a Tailboot USB drive</strong></a>
</p>

Tailboot is a Debian 13 live image. It connects the computer to your tailnet.
It then starts Tailscale SSH.

You do not have to install an operating system. Tailboot runs from a USB drive.

Tailboot does not install Debian on the computer. To use the usual operating
system, first shut down Tailboot. Remove the USB drive. Then, start the computer.

## What Tailboot does

You can use Tailboot to:

- Prepare a new server before you install an operating system.
- Use Debian for a short time. Tailboot does not replace the installed operating
  system.
- Make an SSH connection without an open port on the public internet.

Tailboot contains only the software that is necessary to do these tasks:

- Start the computer.
- Connect to a network.
- Join Tailscale.
- Accept SSH connections.

After you connect, use APT to install other software.

## Prepare to use Tailboot

Make sure that you have these items:

- A Tailscale account
- A USB drive
- A computer with an x86-64 processor that can start from a USB drive

### 1. Create a Tailscale auth key

In the Tailscale admin console, open
[Settings > Keys](https://console.tailscale.com/admin/settings/keys). Select
**Generate auth key**. Use these settings:

| Setting | Value |
| --- | --- |
| Reusable | On |
| Expiration | 90 days |
| Ephemeral | On |
| Pre-approved | On, if available |
| Tags | An isolated tag, such as `tag:isolated` |

Use an isolated tag. Configure your
[tailnet policy](https://console.tailscale.com/admin/acls). Do not let Tailboot
machines connect to other devices. Make sure that your devices can connect to
the Tailboot machines with Tailscale SSH.

A tag does not limit access by itself. Make sure that broad allow rules do not
apply to the tag.

### 2. Create the ISO

1. Open [tailboot.download](https://tailboot.download/).
2. Enter the auth key.
3. If you want to use Wi-Fi, enter the Wi-Fi network name and password.
4. Select **Create ISO**.

Your browser downloads the base ISO. It adds your configuration to the ISO in
your browser. It does not send your credentials to the Tailboot server.

Alternatively, with Node.js 24 or newer, use the CLI from npm:

```sh
npx tailboot@latest <auth-key> tailboot.iso
```

Add `--wifi-ssid "My network" --wifi-password "My password"` for Wi-Fi.
The CLI downloads its matching base ISO and adds your credentials locally.
See [the CLI README](cli/README.md) for installation instructions.

### 3. Write the ISO to a USB drive

1. Use [Etcher](https://etcher.balena.io/), `dd`, or an equivalent ISO tool.
2. Write the customized ISO to a USB drive.
3. Connect the USB drive to the target computer.
4. Start the computer from the USB drive.

Tailboot supports BIOS and UEFI systems.

Tailboot uses Ethernet as the primary connection. If Ethernet has no default
route, Tailboot uses the Wi-Fi network that you added to the ISO.

### 4. Connect with SSH

The computer has the name `tailboot` in your tailnet. If that name is in use,
Tailscale adds a number. For example, the name can be `tailboot-1`.

Use these commands:

```sh
ssh tailboot@tailboot
sudo -i
```

Tailscale authenticates the SSH session. You do not need an SSH password. Your
tailnet policy must permit traffic on port 22. It must also include a Tailscale
SSH rule for the `tailboot` user.

The `autogroup:nonroot` group includes the `tailboot` user. It does not include
the `root` user. Refer to the
[Tailscale SSH documentation](https://tailscale.com/kb/1193/tailscale-ssh) for
policy examples.

## Security

- The customized ISO contains the Tailscale auth key as plain text. It also
  contains the Wi-Fi password as plain text if you supply one.
- Keep the customized ISO and the USB drive in a secure location. Do not give
  them to other persons.
- The browser writes the credentials to the ISO. It does not send them to the
  Tailboot server.
- Each time Tailboot starts, it creates a new ephemeral Tailscale machine
  identity. Tailboot does not keep or restore Tailscale state.
- The auth key expires after 90 days. When the key expires, create a new key and
  a new ISO.
- Each [GitHub release](https://github.com/ShoeBoom/tailboot/releases) contains
  the base ISO and its SHA-256 checksum. The checksum applies only to the base
  ISO. It does not apply to a customized ISO.

## Product limits

Tailboot connects a computer to Tailscale and gives you a shell. It is not a
general rescue system, an operating system installer, or a persistent
workstation.

- The computer must have an internet connection to join Tailscale.
- Tailboot supports one WPA2/WPA3 Personal Wi-Fi network.
- A restart removes changes to the live system.
- The Debian kernel and firmware control hardware support.
- Tailboot automatically logs in to the local console as `tailboot`. If a login
  screen appears, use `tailboot` as the user name and `live` as the password.
  This account can use `sudo` without a password.

## Development

Tailboot uses the [MIT License](LICENSE).

Use these commands to start the website on your computer:

```sh
pnpm install
pnpm test
pnpm dev
```

Use a Debian 13 computer to build the ISO. Install `live-build` and `curl`.
Then, run this command:

```sh
sudo ./image/scripts/build-iso.sh tailboot-local-amd64.iso
```

The script writes the ISO to `image/dist/`.

### CLI package and releases

`pnpm build:cli` prepares the npm package, emitting JavaScript with TypeScript.
It requires `PUBLIC_TAILBOOT_ISO_NAME`, `PUBLIC_TAILBOOT_RELEASE`, and
`PUBLIC_TAILBOOT_CONFIG_OFFSET` from the verified ISO. Run
`pnpm --filter tailboot test` after building to test an installed tarball.
There are no native compiler or platform-specific CLI builds.

The release workflow tests and packs `tailboot` before publishing the ISO,
then publishes that exact package to npm after the ISO is available. The site is
deployed after npm publishing succeeds. npm versions map the release tag
`vYYYY.MM.DD.HHMMSS` to `YYYY.M.DHHMMSS`, removing leading zeroes from each
numeric component (for example, `v2026.09.06.031757` becomes `2026.9.6031757`).

For automated releases, configure the package's
[trusted publisher](https://docs.npmjs.com/trusted-publishers/) in npm:
GitHub Actions owner `ShoeBoom`, repository `tailboot`, workflow `release.yml`,
with publishing allowed. The workflow uses pnpm 11 and OIDC; no npm token is
stored in GitHub.

To publish manually, build with verified release metadata, then run these
commands in `cli/` while authenticated as the npm owner:

```sh
pnpm version <version> --no-git-tag-version --no-git-checks
pnpm test
pnpm publish --access public --no-git-checks
```
