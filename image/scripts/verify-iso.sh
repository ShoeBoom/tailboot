#!/bin/sh

set -eu

iso=${1:-}
if [ -z "${iso}" ] || [ ! -f "${iso}" ]; then
  echo "Usage: ./image/scripts/verify-iso.sh path/to/tailboot.iso" >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
image_dir=$(dirname -- "${script_dir}")
work_dir=$(mktemp -d)
trap 'rm -rf "${work_dir}"' EXIT HUP INT TERM

xorriso -osirrox on -indev "${iso}" \
  -extract /TAILBOOT.JSON "${work_dir}/TAILBOOT.JSON" >/dev/null 2>&1
cmp "${image_dir}/config/includes.binary/TAILBOOT.JSON" \
  "${work_dir}/TAILBOOT.JSON"

xorriso -osirrox on -indev "${iso}" \
  -extract /live/filesystem.squashfs "${work_dir}/filesystem.squashfs" \
  >/dev/null 2>&1
unsquashfs -cat "${work_dir}/filesystem.squashfs" var/lib/dpkg/status \
  > "${work_dir}/dpkg-status"

# live-config creates the login account at boot, so it is not in the image's
# /etc/passwd yet. Check its dependencies even with APT recommends disabled.
for package in live-config live-config-systemd user-setup sudo tailscale jq network-manager wpasupplicant; do
  if ! awk -v package="${package}" 'BEGIN { RS = "" }
    $0 ~ "(^|\n)Package: " package "(\n|$)" &&
    $0 ~ "(^|\n)Status: install ok installed(\n|$)" { found = 1 }
    END { exit !found }
  ' "${work_dir}/dpkg-status"; then
    echo "Required package is not installed in the ISO: ${package}" >&2
    exit 1
  fi
done

unsquashfs -ll "${work_dir}/filesystem.squashfs" \
  > "${work_dir}/squashfs-files"
for service in tailboot tailboot-configure; do
  unsquashfs -cat "${work_dir}/filesystem.squashfs" \
    "etc/systemd/system/${service}.service" > "${work_dir}/${service}.service"
  cmp "${image_dir}/config/includes.chroot/etc/systemd/system/${service}.service" \
    "${work_dir}/${service}.service"
  grep -Fq "etc/systemd/system/multi-user.target.wants/${service}.service" \
    "${work_dir}/squashfs-files"
done
for script in tailboot-configure tailboot-wifi; do
  unsquashfs -cat "${work_dir}/filesystem.squashfs" \
    "usr/local/sbin/${script}" > "${work_dir}/${script}"
  cmp "${image_dir}/config/includes.chroot/usr/local/sbin/${script}" \
    "${work_dir}/${script}"
  grep -Eq "^-rwx[^ ]* .*usr/local/sbin/${script}$" "${work_dir}/squashfs-files"
done

xorriso -indev "${iso}" -report_el_torito plain \
  > "${work_dir}/boot-report" 2>&1
grep -Fq "BIOS" "${work_dir}/boot-report"
grep -Fq "UEFI" "${work_dir}/boot-report"

for boot_config in isolinux/isolinux.cfg boot/grub/config.cfg; do
  xorriso -osirrox on -indev "${iso}" \
    -extract "/${boot_config}" "${work_dir}/$(basename "${boot_config}")" \
    >/dev/null 2>&1
done
grep -Fxq "timeout 50" "${work_dir}/isolinux.cfg"
grep -Fxq "set timeout=5" "${work_dir}/config.cfg"

echo "Verified Tailboot JSON slot, login and network dependencies, services, and unattended BIOS/UEFI boot."
