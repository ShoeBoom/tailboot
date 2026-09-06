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

Alternatively, download the Linux x64 or arm64 CLI and its `.sha256` file from
the same [release](https://github.com/ShoeBoom/tailboot/releases). Choose the CLI
architecture for the computer creating the ISO; the ISO itself boots x86-64 PCs.
Verify the binary with `sha256sum --check <binary>.sha256`, then make it executable
with `chmod +x <binary>`.

For example, after naming the executable `tailboot`:

```sh
read -rsp 'Tailscale auth key: ' TAILBOOT_AUTH_KEY; echo
export TAILBOOT_AUTH_KEY
./tailboot --output customized.iso
unset TAILBOOT_AUTH_KEY
```

For Wi-Fi, also set `TAILBOOT_WIFI_SSID` and `TAILBOOT_WIFI_PASSWORD`, or use
`--wifi-ssid` and `--wifi-password`. The key can also be supplied with `--auth-key`.
Environment variables avoid putting credentials in command-line arguments.
Run `--help` for usage or `--version` for the embedded release metadata.

The CLI includes Node.js, packaged with [Nub](https://github.com/nubjs/nub).
You do not need to install Node.js or Nub. On first run, Nub extracts its runtime
and application into a local cache. ISO downloads and customization stay in RAM:
allow enough free memory for the entire ISO plus runtime and download overhead.
It downloads only its embedded release, checks the base ISO's SHA-256, and uses
the same patcher as the website. It does not accept local ISOs or overwrite
existing output files. Credentials stay on your computer and are never logged.

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
  the base ISO, Linux CLI binaries, and a SHA-256 checksum for each. The ISO
  checksum applies only to the base ISO, not a customized ISO.

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

Release CI verifies the ISO and creates `release.json` with its tag, filename,
SHA-256 and verified configuration byte offset. On a Linux x64 or arm64 build
machine, compile and test the CLI with that metadata:

```sh
pnpm build:cli
node cli/test-binary.ts cli/dist/tailboot image/dist/<iso> image/dist/release.json
```

The build command uses Nub directly to bundle TypeScript, inject
`image/dist/release.json`, and embed Node in `cli/dist/tailboot`. CI gives the
verified binary its release and platform filename when staging it for upload.

Nub and the embedded Node version are pinned. CLI tests run the executable with
an empty tool search path and redirect its fixed release URL through a test-only
HTTP fixture. Release CI runs them against the actual verified ISO on both
architectures, including failed downloads and configuration errors.

The ISO, CLI binaries, and website all build from the same source commit. Assets
are staged in a new draft release. Publication waits for every build and test,
then downloads the staged assets to verify their checksums and metadata. Only
after publication does CI deploy the website. Each draft records the source
commit and workflow run so failed attempts can be inspected. Publication promotes
the tested assets without rebuilding them. Existing releases are never reused
or overwritten.

If an attempt fails before publication, leave its draft unpublished and inspect
the linked workflow logs. Start a fresh attempt with a new tag or a new manual
workflow run. The previous release and website remain available. Delete abandoned
drafts manually when they are no longer useful; CI does not clean them up.

If publication succeeds but website deployment fails, rerun only the
`deploy-site` job in that workflow run. It deploys the same Pages artifact without
rebuilding the website or changing the published release. The previous website
stays available until deployment succeeds. If the Pages artifact has expired,
start a fresh release attempt instead.
