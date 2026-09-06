#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_TAG:?}" "${ISO_NAME:?}" "${CONFIG_OFFSET:?}"
work_dir=$(mktemp -d)
trap 'rm -rf "${work_dir}"' EXIT

test "$(gh release view "${RELEASE_TAG}" --json isDraft --jq .isDraft)" = true
assets=(
  "${ISO_NAME}"
  "tailboot-${RELEASE_TAG}-linux-x64"
  "tailboot-${RELEASE_TAG}-linux-arm64"
)
{
  printf '%s\n' release.json
  for asset in "${assets[@]}"; do
    printf '%s\n' "${asset}" "${asset}.sha256"
  done
} | sort > "${work_dir}/expected"
gh release view "${RELEASE_TAG}" --json assets --jq '.assets[].name' \
  | sort > "${work_dir}/actual"
diff -u "${work_dir}/expected" "${work_dir}/actual"

# Verify the uploaded bytes, not just the local build outputs or asset names.
gh release download "${RELEASE_TAG}" --dir "${work_dir}/assets"
(
cd "${work_dir}/assets"
sha256sum --check --strict -- *.sha256
python3 - <<'PY'
import json
import os
from pathlib import Path

metadata = json.loads(Path("release.json").read_text())
assert metadata == {
    "tag": os.environ["RELEASE_TAG"],
    "isoName": os.environ["ISO_NAME"],
    "sha256": Path(os.environ["ISO_NAME"] + ".sha256").read_text().split()[0],
    "configOffset": int(os.environ["CONFIG_OFFSET"]),
}, "Uploaded metadata differs from the verified ISO build"
PY
)

# This is the only publication step. A failure above leaves the draft unpublished.
gh release edit "${RELEASE_TAG}" --draft=false --latest
