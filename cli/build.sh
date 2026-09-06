#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${RELEASE_TAG:?}" "${ISO_NAME:?}" "${ISO_SHA256:?}" "${CONFIG_OFFSET:?}"
mkdir -p dist
ldflags="-s -w -X main.releaseTag=${RELEASE_TAG} -X main.isoName=${ISO_NAME} -X main.isoSHA256=${ISO_SHA256} -X main.configOffset=${CONFIG_OFFSET}"
for platform in linux darwin windows; do
  for arch in amd64 arm64; do
    name="tailboot-${RELEASE_TAG}-${platform}-${arch}"
    if [ "$platform" = windows ]; then name="${name}.exe"; fi
    CGO_ENABLED=0 GOOS="$platform" GOARCH="$arch" go build -trimpath -ldflags "$ldflags" -o "dist/$name" .
    (cd dist && sha256sum "$name" > "$name.sha256")
  done
done
