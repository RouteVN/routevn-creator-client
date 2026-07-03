#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINUX_RELEASE_ARCH="x86_64"
DOCKER_PLATFORM="linux/amd64"
IMAGE_NAME="${ROUTEVN_APPIMAGE_DOCKER_IMAGE:-routevn-creator-appimage-builder:ubuntu-22.04-${LINUX_RELEASE_ARCH}}"
OUT_DIR="${ROUTEVN_APPIMAGE_OUT_DIR:-${ROOT_DIR}/dist/appimage/ubuntu-22.04/${LINUX_RELEASE_ARCH}}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required for the Ubuntu 22.04 AppImage build."
  exit 1
fi

if [ ! -f "${ROOT_DIR}/.env" ]; then
  echo "Error: ${ROOT_DIR}/.env is required because the AppImage build signs updater artifacts."
  exit 1
fi

mkdir -p "${OUT_DIR}"

docker build \
  --platform "${DOCKER_PLATFORM}" \
  -f "${ROOT_DIR}/docker/appimage/ubuntu-22.04.Dockerfile" \
  -t "${IMAGE_NAME}" \
  "${ROOT_DIR}"

docker run --rm \
  --platform "${DOCKER_PLATFORM}" \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  -e ROUTEVN_LINUX_RELEASE_ARCH="${LINUX_RELEASE_ARCH}" \
  -e APPIMAGE_EXTRACT_AND_RUN=1 \
  -e NO_STRIP="${NO_STRIP:-1}" \
  -v "${ROOT_DIR}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  -v routevn-appimage-${LINUX_RELEASE_ARCH}-bun-cache:/cache/bun \
  -v routevn-appimage-${LINUX_RELEASE_ARCH}-cargo-home:/cache/cargo-home \
  -v routevn-appimage-${LINUX_RELEASE_ARCH}-cargo-target:/cache/cargo-target \
  "${IMAGE_NAME}"

echo "Ubuntu 22.04 AppImage ${LINUX_RELEASE_ARCH} artifacts are in ${OUT_DIR}"
