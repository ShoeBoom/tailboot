#!/bin/sh

set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root (for example: sudo ./image/scripts/build-iso.sh)." >&2
  exit 1
fi

output_name=${1:-tailboot-amd64.iso}
case "${output_name}" in
  *.iso) ;;
  *)
    echo "The output name must be an .iso file name without directories." >&2
    exit 1
    ;;
esac
case "${output_name}" in
  */*)
    echo "The output name must not contain directories." >&2
    exit 1
    ;;
esac

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
image_dir=$(dirname -- "${script_dir}")

cd "${image_dir}"
lb clean --purge

# live-build consumes this key while installing the package from Tailscale's
# official APT repository. It is fetched fresh so key rotation does not require
# a source change.
curl --fail --silent --show-error --location \
  https://pkgs.tailscale.com/stable/debian/trixie.asc \
  --output config/archives/tailscale.key.chroot

# The browser implements this version's saved-key format. Verify upgrades
# against test-tailcat.ts before changing the binary or its checksum.
mkdir -p config/packages.chroot
curl --fail --silent --show-error --location \
  https://github.com/tailscale/tailcat/releases/download/v0.6.0/tailcat_0.6.0_linux_amd64.deb \
  --output config/packages.chroot/tailcat.deb
printf '%s\n' 'ad5a9ce4b16b6e9e1db254900452589114520d690a174d4dae6006450d870e43  config/packages.chroot/tailcat.deb' \
  | sha256sum --check --strict

lb config
lb build

mkdir -p "${image_dir}/dist"
install -m 0644 live-image-amd64.hybrid.iso \
  "${image_dir}/dist/${output_name}"
