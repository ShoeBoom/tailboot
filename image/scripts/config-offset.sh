#!/bin/sh

set -eu

iso=${1:?Usage: config-offset.sh path/to/tailboot.iso}
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# report_lba gives the start in 2048-byte sectors. Require a single 4 KiB extent.
report=$(xorriso -abort_on FAILURE -indev "${iso}" \
  -find /TAILBOOT.JSON -exec report_lba --)
lba=$(printf '%s\n' "${report}" | awk -F , '
  /^File data lba:/ {
    count++
    if ($1 !~ /: *0 *$/ || $2 !~ /^ *[0-9]+ *$/ || $3 != 2 || $4 != 4096) exit 1
    lba = $2 + 0
  }
  END { if (count != 1) exit 1; print lba }
')

# Verify the raw bytes at that position before exposing it to the site build.
dd if="${iso}" bs=2048 skip="${lba}" count=2 2>/dev/null \
  | cmp - "${script_dir}/../config/includes.binary/TAILBOOT.JSON"
printf '%s\n' "$((lba * 2048))"
