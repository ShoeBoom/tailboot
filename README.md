<h1 align="center">
  <img src="site/public/logo.svg" alt="Tailboot" width="420">
</h1>

<p align="center">
  <strong>Use Tailboot to start Debian and connect to a computer with Tailscale or Tailcat SSH.</strong>
</p>

<p align="center">
  <a href="https://tailboot.download/"><strong>Create a Tailboot USB drive</strong></a>
</p>

Tailboot is a Debian 13 live image. It gives you SSH access through Tailscale,
Tailcat, or both. Configure at least one connection method when creating the ISO.

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
- Connect through Tailscale or Tailcat.
- Accept SSH connections.

After you connect, use APT to install other software.

## Prepare to use Tailboot

Make sure that you have these items:

- A Tailscale account if you choose Tailscale, or Tailcat 0.6.0+ on your computer
  if you choose Tailcat
- A USB drive
- A computer with an x86-64 processor that can start from a USB drive

### 1. Choose a connection method

For **Tailcat**, select **Enable Tailcat** in the website customizer. The browser
uses cryptographically secure randomness to generate a new identity and an
independent 256-bit WireGuard pre-shared key. There is no password or editable
ID field. Copy and save the displayed connection command. Use **Save private
key** if you want to import this identity again later.

You can also paste the contents of an existing Tailcat `.private.json` key file.
Imports must include a pre-shared key and a fixed numeric relay region, with
matching node and discovery public keys. For example, generate an importable
key using `tailcat genkey --key=tailboot --region=301`. A `tc…` address alone
cannot configure a server. Structural validation cannot prove that an imported
key was randomly generated; use Tailcat's generator or the website generator.

Generated identities use Tailcat's New York bootstrap relay (region 301), so the
connection address is known before booting and stays the same across reboots.
Tailcat can upgrade the connection to a direct peer-to-peer path.

**Keep the connection command private: anyone with the address can open a shell.**
Generate a separate identity and ISO for each machine used simultaneously.
Booting copies of the same Tailcat ISO concurrently reuses the same identity.

For **Tailscale**, create an auth key as described below. You can configure
Tailscale alongside Tailcat; either route can connect independently.

#### Create a Tailscale auth key

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
2. Enter a Tailscale auth key, enable Tailcat, or configure both.
   If using Tailcat, save its connection command.
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

For Tailcat, [install Tailcat 0.6.0 or newer](https://github.com/tailscale/tailcat#install)
on your computer and run the connection command saved from the customizer:

```sh
tailcat ssh tc…
sudo -i
```

The shell runs as `tailboot`, which has passwordless sudo. The address is the
credential; no additional SSH key or password is required.

For Tailscale:

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

- The customized ISO contains your configured Tailscale auth key, Tailcat private
  key, and Wi-Fi password as plain text.
- Keep the customized ISO and the USB drive in a secure location. Do not give
  them to other persons.
- The browser writes the credentials to the ISO. It does not send them to the
  Tailboot server.
- Each time Tailboot starts, it creates a new ephemeral Tailscale machine
  identity. Tailboot does not keep or restore Tailscale state.
- Tailcat reuses the key embedded in the ISO; it has no built-in expiry. Generate
  a new identity and ISO to replace a shared or exposed address.
- The Tailscale auth key expires after 90 days. When the key expires, create a new key and
  a new ISO.
- Each [GitHub release](https://github.com/ShoeBoom/tailboot/releases) contains
  the base ISO and its SHA-256 checksum. The checksum applies only to the base
  ISO. It does not apply to a customized ISO.

## Product limits

Tailboot connects a computer through Tailscale or Tailcat and gives you a shell. It is not a
general rescue system, an operating system installer, or a persistent
workstation.

- The computer must have an internet connection.
- The image pins Tailcat 0.6.0. Tailcat does not promise stable APIs, CLI flags,
  or relay availability; version upgrades require compatibility testing.
- The standalone Tailboot CLI currently supports Tailscale customization. Use
  the website for Tailcat.
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
Then, run this command (the build downloads and verifies the pinned Tailcat package):

```sh
sudo ./image/scripts/build-iso.sh tailboot-local-amd64.iso
```

The script writes the ISO to `image/dist/`.

Release checks test all three connection configurations, native Tailcat key and
address interoperability, and SSH over a local test relay before publishing.
Run the Tailcat integration check against a downloaded or built binary with:

```sh
node image/scripts/test-tailcat.ts /path/to/tailcat
```
