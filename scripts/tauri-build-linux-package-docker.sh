#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_KIND="${1:-}"
LINUX_RELEASE_ARCH="x86_64"
DOCKER_PLATFORM="linux/amd64"

case "${PACKAGE_KIND}" in
  deb)
    IMAGE_NAME="${ROUTEVN_DEB_DOCKER_IMAGE:-routevn-creator-deb-builder:ubuntu-22.04-${LINUX_RELEASE_ARCH}}"
    DOCKERFILE="${ROOT_DIR}/docker/linux-packages/ubuntu-22.04.Dockerfile"
    OUT_DIR="${ROUTEVN_DEB_OUT_DIR:-${ROOT_DIR}/dist/linux-packages/ubuntu-22.04/${LINUX_RELEASE_ARCH}}"
    CACHE_PREFIX="routevn-linux-deb-${LINUX_RELEASE_ARCH}"
    ;;
  rpm)
    IMAGE_NAME="${ROUTEVN_RPM_DOCKER_IMAGE:-routevn-creator-rpm-builder:fedora-43-${LINUX_RELEASE_ARCH}}"
    DOCKERFILE="${ROOT_DIR}/docker/linux-packages/fedora-43.Dockerfile"
    OUT_DIR="${ROUTEVN_RPM_OUT_DIR:-${ROOT_DIR}/dist/linux-packages/fedora-43/${LINUX_RELEASE_ARCH}}"
    CACHE_PREFIX="routevn-linux-rpm-${LINUX_RELEASE_ARCH}"
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
  --platform "${DOCKER_PLATFORM}" \
  -f "${DOCKERFILE}" \
  -t "${IMAGE_NAME}" \
  "${ROOT_DIR}"

docker run --rm \
  --platform "${DOCKER_PLATFORM}" \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  -e ROUTEVN_LINUX_RELEASE_ARCH="${LINUX_RELEASE_ARCH}" \
  -e ROUTEVN_BUNDLE_KIND="${PACKAGE_KIND}" \
  -v "${ROOT_DIR}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  -v routevn-linux-package-bun-cache:/cache/bun \
  -v "${CACHE_PREFIX}-cargo-home:/cache/cargo-home" \
  -v "${CACHE_PREFIX}-cargo-target:/cache/cargo-target" \
  "${IMAGE_NAME}"

echo "${PACKAGE_KIND} ${LINUX_RELEASE_ARCH} artifacts are in ${OUT_DIR}"
