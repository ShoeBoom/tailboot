#!/bin/sh

set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root (for example: sudo ./scripts/build-iso.sh)." >&2
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
repository_dir=$(dirname -- "${script_dir}")
image_dir="${repository_dir}/image"

cd "${image_dir}"
lb clean --purge

# live-build consumes this key while installing the package from Tailscale's
# official APT repository. It is fetched fresh so key rotation does not require
# a source change.
curl --fail --silent --show-error --location \
  https://pkgs.tailscale.com/stable/debian/trixie.asc \
  --output config/archives/tailscale.key.chroot

lb config
lb build

mkdir -p "${repository_dir}/dist"
install -m 0644 live-image-amd64.hybrid.iso \
  "${repository_dir}/dist/${output_name}"
