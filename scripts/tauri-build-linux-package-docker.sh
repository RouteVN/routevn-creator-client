#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_KIND="${1:-}"

case "${PACKAGE_KIND}" in
  deb)
    IMAGE_NAME="${ROUTEVN_DEB_DOCKER_IMAGE:-routevn-creator-deb-builder:ubuntu-22.04}"
    DOCKERFILE="${ROOT_DIR}/docker/linux-packages/ubuntu-22.04.Dockerfile"
    OUT_DIR="${ROUTEVN_DEB_OUT_DIR:-${ROOT_DIR}/dist/linux-packages/ubuntu-22.04}"
    CACHE_PREFIX="routevn-linux-deb"
    ;;
  rpm)
    IMAGE_NAME="${ROUTEVN_RPM_DOCKER_IMAGE:-routevn-creator-rpm-builder:fedora-43}"
    DOCKERFILE="${ROOT_DIR}/docker/linux-packages/fedora-43.Dockerfile"
    OUT_DIR="${ROUTEVN_RPM_OUT_DIR:-${ROOT_DIR}/dist/linux-packages/fedora-43}"
    CACHE_PREFIX="routevn-linux-rpm"
    ;;
  *)
    echo "Usage: $0 deb|rpm"
    exit 1
    ;;
esac

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required for Linux package builds."
  exit 1
fi

mkdir -p "${OUT_DIR}"

docker build \
  --platform linux/amd64 \
  -f "${DOCKERFILE}" \
  -t "${IMAGE_NAME}" \
  "${ROOT_DIR}"

docker run --rm \
  --platform linux/amd64 \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  -e ROUTEVN_BUNDLE_KIND="${PACKAGE_KIND}" \
  -v "${ROOT_DIR}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  -v routevn-linux-package-bun-cache:/cache/bun \
  -v "${CACHE_PREFIX}-cargo-home:/cache/cargo-home" \
  -v "${CACHE_PREFIX}-cargo-target:/cache/cargo-target" \
  "${IMAGE_NAME}"

echo "${PACKAGE_KIND} artifacts are in ${OUT_DIR}"
