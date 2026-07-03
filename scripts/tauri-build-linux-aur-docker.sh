#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${ROUTEVN_AUR_DOCKER_IMAGE:-routevn-creator-aur-builder:archlinux}"
OUT_DIR="${ROUTEVN_AUR_OUT_DIR:-${ROOT_DIR}/dist/aur}"
DOCKERFILE="${ROOT_DIR}/docker/aur/archlinux.Dockerfile"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required for AUR package builds."
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
  -v "${ROOT_DIR}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  -v routevn-linux-aur-bun-cache:/cache/bun \
  -v routevn-linux-aur-cargo-home:/cache/cargo-home \
  -v routevn-linux-aur-cargo-target:/cache/cargo-target \
  "${IMAGE_NAME}"

echo "AUR package artifacts are in ${OUT_DIR}"
