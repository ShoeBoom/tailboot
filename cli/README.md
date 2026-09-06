# Tailboot CLI

Create a Tailboot ISO with your Tailscale auth key and optional Wi-Fi credentials.
Requires Node.js 24 or newer.

```sh
npx tailboot@latest <auth-key> tailboot.iso
npx tailboot@latest <auth-key> tailboot.iso --wifi-ssid "My network" --wifi-password "My password"
```

Or install the command:

```sh
npm install --global tailboot
tailboot <auth-key> tailboot.iso
```

Each package version downloads its matching, verified base ISO from the
[Tailboot releases](https://github.com/ShoeBoom/tailboot/releases). Your credentials
are added locally; they are not sent to a server. The customized ISO contains
those credentials in plain text, so keep it secure.

See [tailboot.download](https://tailboot.download/) for auth key settings and
instructions for writing the ISO to a USB drive and connecting with Tailscale SSH.
