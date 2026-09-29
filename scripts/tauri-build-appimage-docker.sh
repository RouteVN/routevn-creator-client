#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export VITE_ROUTEVN_DISTRIBUTION=direct
LINUX_RELEASE_ARCH="x86_64"
DOCKER_PLATFORM="linux/amd64"
read_tauri_config_value() {
  (
    cd "${ROOT_DIR}"
    bun --print "JSON.parse(await Bun.file('src-tauri/tauri.conf.json').text()).${1}"
  )
}

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required to read Tauri metadata."
  exit 1
fi

APP_VERSION="$(read_tauri_config_value "version")"
APPIMAGE_RELEASE_DIR="linux-${LINUX_RELEASE_ARCH}-${APP_VERSION}"
IMAGE_NAME="${ROUTEVN_APPIMAGE_DOCKER_IMAGE:-routevn-creator-appimage-builder:ubuntu-22.04-${LINUX_RELEASE_ARCH}}"
OUT_DIR="${ROUTEVN_APPIMAGE_OUT_DIR:-${ROOT_DIR}/src-tauri/target/release/bundle/appimage/${APPIMAGE_RELEASE_DIR}}"
HOST_TAURI_CACHE_DIR="${ROUTEVN_TAURI_CACHE_DIR:-${HOME}/.cache/tauri}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is required for the Ubuntu 22.04 AppImage build."
  exit 1
fi

# The updater signing key comes from the environment (passed to the container by
# name, so it never appears on the command line) or, as before, from .env.
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] && ! grep -q '^TAURI_SIGNING_PRIVATE_KEY=' "${ROOT_DIR}/.env" 2>/dev/null; then
  echo "Error: set TAURI_SIGNING_PRIVATE_KEY or define it in ${ROOT_DIR}/.env because the AppImage build signs updater artifacts."
  exit 1
fi

SYMBOLS_OUT_DIR="${ROOT_DIR}/.artifacts/docker-crash-symbols"
rm -rf "${SYMBOLS_OUT_DIR}"
mkdir -p "${OUT_DIR}" "${SYMBOLS_OUT_DIR}"

docker_run_args=(
  --rm
  --platform "${DOCKER_PLATFORM}"
  -e HOST_UID="$(id -u)"
  -e HOST_GID="$(id -g)"
  -e ROUTEVN_LINUX_RELEASE_ARCH="${LINUX_RELEASE_ARCH}"
  -e APPIMAGE_EXTRACT_AND_RUN=1
  -e NO_STRIP="${NO_STRIP:-1}"
  -v "${ROOT_DIR}:/src:ro"
  -v "${OUT_DIR}:/out"
  -v "${SYMBOLS_OUT_DIR}:/symbols-out"
  -v routevn-appimage-${LINUX_RELEASE_ARCH}-bun-cache:/cache/bun
  -v routevn-appimage-${LINUX_RELEASE_ARCH}-cargo-home:/cache/cargo-home
  -v routevn-appimage-${LINUX_RELEASE_ARCH}-cargo-target:/cache/cargo-target
  -v routevn-appimage-${LINUX_RELEASE_ARCH}-tauri-cache:/cache/xdg
)

for name in TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD; do
  if [ -n "${!name+x}" ]; then
    docker_run_args+=(-e "${name}")
  fi
done

# The container copies the source without .git, so pass the error-reporting
# build ID in from the host checkout.
build_id="${ROUTEVN_BUILD_ID:-$(git -C "${ROOT_DIR}" rev-parse --short=12 HEAD 2>/dev/null || true)}"
if [ -n "${build_id}" ]; then
  docker_run_args+=(-e ROUTEVN_BUILD_ID="${build_id}")
fi

if [ -d "${HOST_TAURI_CACHE_DIR}" ]; then
  docker_run_args+=(-v "${HOST_TAURI_CACHE_DIR}:/host-tauri-cache:ro")
fi

: "${ROUTEVN_SYMBOLS_REV:?Set ROUTEVN_SYMBOLS_REV to the routevn-observability commit that provides routevn-symbols}"
docker build \
  --ssh default \
  --build-arg ROUTEVN_SYMBOLS_REV="${ROUTEVN_SYMBOLS_REV}" \
  --platform "${DOCKER_PLATFORM}" \
  -f "${ROOT_DIR}/docker/appimage/ubuntu-22.04.Dockerfile" \
  -t "${IMAGE_NAME}" \
  "${ROOT_DIR}"

docker run "${docker_run_args[@]}" "${IMAGE_NAME}"

IFS=$'\t' read -r symbol_release symbol_dist < <(node "${ROOT_DIR}/scripts/crash-symbols-info.js" linux)
host_js_dir="${ROOT_DIR}/.artifacts/crash-symbols/linux/${symbol_release}-${symbol_dist}/js"
mkdir -p "$(dirname "${host_js_dir}")"
rm -rf "${host_js_dir}"
cp -a "${SYMBOLS_OUT_DIR}/js" "${host_js_dir}"
ROUTEVN_SYMBOLS_NATIVE_FILE="${SYMBOLS_OUT_DIR}/routevn-creator.debug" \
  bash "${ROOT_DIR}/scripts/upload-crash-symbols.sh" linux

echo "Linux AppImage ${LINUX_RELEASE_ARCH} artifacts are in ${OUT_DIR}"
