#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_PLATFORM="${ROUTEVN_WINDOWS_TEMPLATE_DOCKER_PLATFORM:-linux/amd64}"
IMAGE_NAME="${ROUTEVN_WINDOWS_TEMPLATE_DOCKER_IMAGE:-routevn-windows-player-template-builder:ubuntu-22.04}"
OUT_DIR="${ROUTEVN_WINDOWS_TEMPLATE_OUT_DIR:-${ROOT_DIR}/src-tauri/assets/player-templates/windows}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required for the Windows player template build."
  exit 1
fi

mkdir -p "${OUT_DIR}"

docker build \
  --platform "${DOCKER_PLATFORM}" \
  -f "${ROOT_DIR}/docker/windows-player-template/ubuntu-22.04.Dockerfile" \
  -t "${IMAGE_NAME}" \
  "${ROOT_DIR}"

docker run \
  --rm \
  --platform "${DOCKER_PLATFORM}" \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  -v "${ROOT_DIR}:/src:ro" \
  -v "${OUT_DIR}:/out" \
  -v routevn-windows-template-bun-cache:/cache/bun \
  -v routevn-windows-template-cargo-home:/cache/cargo-home \
  -v routevn-windows-template-cargo-target:/cache/cargo-target \
  -v routevn-windows-template-xdg-cache:/cache/xdg \
  "${IMAGE_NAME}"

echo "Windows player template artifact is in ${OUT_DIR}/RouteVNPlayerTemplate.exe"
