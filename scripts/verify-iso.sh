#!/bin/sh

set -eu

iso=${1:-}
if [ -z "${iso}" ] || [ ! -f "${iso}" ]; then
  echo "Usage: ./scripts/verify-iso.sh path/to/tailboot.iso" >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repository_dir=$(dirname -- "${script_dir}")
work_dir=$(mktemp -d)
trap 'rm -rf "${work_dir}"' EXIT HUP INT TERM

xorriso -osirrox on -indev "${iso}" \
  -extract /TAILBOOT.KEY "${work_dir}/TAILBOOT.KEY" >/dev/null 2>&1
cmp "${repository_dir}/image/config/includes.binary/TAILBOOT.KEY" \
  "${work_dir}/TAILBOOT.KEY"

xorriso -osirrox on -indev "${iso}" \
  -extract /live/filesystem.squashfs "${work_dir}/filesystem.squashfs" \
  >/dev/null 2>&1
unsquashfs -cat "${work_dir}/filesystem.squashfs" var/lib/dpkg/status \
  > "${work_dir}/dpkg-status"

grep -Fxq "Package: tailscale" "${work_dir}/dpkg-status"

unsquashfs -ll "${work_dir}/filesystem.squashfs" \
  > "${work_dir}/squashfs-files"
grep -Fq "etc/systemd/system/tailboot.service" \
  "${work_dir}/squashfs-files"

xorriso -indev "${iso}" -report_el_torito plain \
  > "${work_dir}/boot-report" 2>&1
grep -Fq "BIOS" "${work_dir}/boot-report"
grep -Fq "UEFI" "${work_dir}/boot-report"

echo "Verified Tailboot key slot, Tailscale, service, and BIOS/UEFI boot records."
