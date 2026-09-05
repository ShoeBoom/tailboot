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

CI uses `xorriso` to locate `/TAILBOOT.JSON` after building and verifying the
ISO. It passes the byte offset to Astro as `PUBLIC_TAILBOOT_CONFIG_OFFSET`,
alongside the release tag and ISO name. The browser checks and replaces only
that 4096-byte slot while streaming the download.

To test the browser customizer against a built ISO with Node and `xorriso`:

```sh
config_offset=$(./image/scripts/config-offset.sh image/dist/tailboot-local-amd64.iso)
node image/scripts/test-iso-patch.ts image/dist/tailboot-local-amd64.iso "${config_offset}"
```

This checks that xorriso can extract the customized JSON and that the image
size and every byte outside the slot stay unchanged. CI runs this test before
publishing a release. A release retry refuses to deploy the rebuilt ISO's
offset if its checksum differs from the existing release asset.

For a local site build using a published ISO, set `PUBLIC_TAILBOOT_RELEASE`,
`PUBLIC_TAILBOOT_ISO_NAME`, and the offset obtained from that exact ISO:

```sh
export PUBLIC_TAILBOOT_CONFIG_OFFSET=$(./image/scripts/config-offset.sh path/to/published.iso)
pnpm build
```
