<h1 align="center">
  <img src="logo.svg" alt="Tailboot" width="420">
</h1>

<p align="center">
  <strong>Boot a computer into Debian and reach it over Tailscale SSH—no installation, display, or keyboard required.</strong>
</p>

<p align="center">
  <a href="https://tailboot.download/"><strong>Create a Tailboot USB →</strong></a>
</p>

Tailboot is a small, headless Debian 13 live image for bringing a machine onto
your tailnet. Give it a Tailscale auth key, optionally add Wi-Fi credentials,
flash it to a USB drive, and boot. The machine connects to Tailscale and enables
Tailscale SSH automatically.

It runs entirely as a live system and is not an installer. Remove the USB drive
and reboot to return to the machine's normal operating system.

## Why Tailboot?

Tailboot is useful when you want a remote shell on a physical machine without
first installing or configuring an operating system. For example:

- Bring a headless machine online from across the room—or across the internet.
- Bootstrap a new server before deciding what to install on it.
- Run a temporary Debian environment without replacing the installed OS.
- Get secure remote access without exposing SSH to the public internet.

Tailboot deliberately includes only what it needs to boot, connect to a network,
join Tailscale, and accept SSH connections. Once connected, install any
additional tools you need with APT.

## Get started

You need a Tailscale account, a USB drive, and an x86-64 machine that can boot
from USB.

### 1. Create a Tailscale auth key

Open [Settings → Keys](https://console.tailscale.com/admin/settings/keys) in
the Tailscale admin console and generate a key with these settings:

| Setting | Value |
| --- | --- |
| Reusable | On |
| Expiration | 90 days |
| Ephemeral | On |
| Pre-approved | On, if available |
| Tags | An isolated tag such as `tag:isolated` |

Using an isolated tag is strongly recommended. Configure your
[tailnet policy](https://console.tailscale.com/admin/acls) so that Tailboot
machines cannot reach other devices, while your own devices can reach them over
Tailscale SSH. A tag does not restrict access by itself; your policy must exclude
it from broad allow rules.

### 2. Create your ISO

Go to [tailboot.download](https://tailboot.download/), enter the auth key, and
optionally add a Wi-Fi network. Tailboot downloads the base image and adds your
configuration locally in the browser—your credentials are not uploaded.

### 3. Flash and boot

Write the customized ISO to a USB drive with
[Etcher](https://etcher.balena.io/), `dd`, or another ISO-writing tool. Insert
the drive and boot the target machine from it. Tailboot starts automatically on
both BIOS and UEFI systems; no display or keyboard is needed.

Ethernet is preferred. If it is unavailable, Tailboot connects to the Wi-Fi
network you supplied.

### 4. Connect

The machine appears in your tailnet as `tailboot` (or `tailboot-1`,
`tailboot-2`, and so on if the name is already in use):

```sh
ssh tailboot@tailboot
sudo -i
```

Tailscale authenticates the SSH session, so there is no SSH password. Your
tailnet policy must allow port 22 and include a Tailscale SSH rule for the
`tailboot` user. `autogroup:nonroot` includes this user; it does not include
`root`. See [Tailscale's SSH documentation](https://tailscale.com/kb/1193/tailscale-ssh)
for policy examples.

## Security and lifecycle

- Your customized ISO contains the Tailscale auth key and any Wi-Fi password in
  plain text. Treat the ISO and USB drive like a credential and do not share
  them.
- Credentials are written into the ISO in your browser and are never sent to
  Tailboot's server.
- Every boot creates a new ephemeral Tailscale machine identity. Tailboot does
  not persist or restore Tailscale state.
- Auth keys expire after 90 days. When yours expires, create a new key and a new
  ISO.
- Each [GitHub release](https://github.com/ShoeBoom/tailboot/releases) includes
  the unmodified base ISO and its SHA-256 checksum. Customization changes the
  image, so the published checksum does not apply to a customized ISO.

## Scope and limitations

Tailboot is intentionally narrow: it gets a machine online and gives you a
shell. It is not a general-purpose rescue environment, an OS installer, or a
persistent workstation.

- Internet access is required for the machine to join Tailscale.
- Wi-Fi support is limited to one WPA2/WPA3 Personal network.
- Changes made to the live system do not persist across boots.
- Hardware support depends on Debian's included kernel and firmware.
- The local console logs in automatically as `tailboot`. If prompted, use the
  password `live`; the account has passwordless sudo.

## Developing Tailboot

The project is open source under the [MIT License](LICENSE). To run the website
locally:

```sh
pnpm install
pnpm test
pnpm dev
```

To build the ISO on Debian 13 with `live-build` and `curl` installed:

```sh
sudo ./scripts/build-iso.sh tailboot-local-amd64.iso
```

The output is written to `dist/`.
