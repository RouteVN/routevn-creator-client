#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINUX_RELEASE_ARCH="x86_64"
DOCKER_PLATFORM="linux/amd64"
IMAGE_NAME="${ROUTEVN_AUR_DOCKER_IMAGE:-routevn-creator-aur-builder:archlinux-${LINUX_RELEASE_ARCH}}"
OUT_DIR="${ROUTEVN_AUR_OUT_DIR:-${ROOT_DIR}/dist/aur/${LINUX_RELEASE_ARCH}}"
DOCKERFILE="${ROOT_DIR}/docker/aur/archlinux.Dockerfile"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required for AUR package builds."
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
  -v "${ROOT_DIR}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  -v routevn-linux-aur-${LINUX_RELEASE_ARCH}-bun-cache:/cache/bun \
  -v routevn-linux-aur-${LINUX_RELEASE_ARCH}-cargo-home:/cache/cargo-home \
  -v routevn-linux-aur-${LINUX_RELEASE_ARCH}-cargo-target:/cache/cargo-target \
  "${IMAGE_NAME}"

echo "AUR ${LINUX_RELEASE_ARCH} package artifacts are in ${OUT_DIR}"
