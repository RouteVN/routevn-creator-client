#!/usr/bin/env bash

set -euo pipefail

SRC_DIR="${ROUTEVN_SRC_DIR:-/src}"
WORK_DIR="${ROUTEVN_WORK_DIR:-/work}"
OUT_DIR="${ROUTEVN_OUT_DIR:-/out}"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/cache/cargo-target}"
BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-/cache/bun}"
CARGO_HOME="${CARGO_HOME:-/cache/cargo-home}"
XDG_CACHE_HOME="${XDG_CACHE_HOME:-/cache/xdg}"
HOST_TAURI_CACHE_DIR="${HOST_TAURI_CACHE_DIR:-/host-tauri-cache}"
HOST_UID="${HOST_UID:-}"
HOST_GID="${HOST_GID:-}"

export CARGO_TARGET_DIR
export BUN_INSTALL_CACHE_DIR
export CARGO_HOME
export XDG_CACHE_HOME
export RUSTUP_HOME="${RUSTUP_HOME:-/opt/rustup}"
export APPIMAGE_EXTRACT_AND_RUN="${APPIMAGE_EXTRACT_AND_RUN:-1}"
export NO_STRIP="${NO_STRIP:-1}"
export PATH="/opt/cargo/bin:/opt/bun/bin:/usr/local/bin:${PATH}"

if [ ! -f "${SRC_DIR}/package.json" ]; then
  echo "Error: ${SRC_DIR} does not look like the RouteVN Creator repo."
  exit 1
fi

if [ ! -f "${SRC_DIR}/.env" ]; then
  echo "Error: ${SRC_DIR}/.env is required because the AppImage build signs updater artifacts."
  exit 1
fi

if ! grep -q '^TAURI_SIGNING_PRIVATE_KEY=' "${SRC_DIR}/.env"; then
  echo "Error: .env must define TAURI_SIGNING_PRIVATE_KEY."
  exit 1
fi

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}" "${OUT_DIR}" "${BUN_INSTALL_CACHE_DIR}" "${CARGO_HOME}" "${CARGO_TARGET_DIR}" "${XDG_CACHE_HOME}"

if [ -d "${HOST_TAURI_CACHE_DIR}" ]; then
  mkdir -p "${XDG_CACHE_HOME}/tauri"
  cp -a "${HOST_TAURI_CACHE_DIR}/." "${XDG_CACHE_HOME}/tauri/"
fi

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '_site' \
  --exclude '.rettangoli/vt/_site' \
  --exclude 'src-tauri/target' \
  --exclude 'test-results' \
  "${SRC_DIR}/" "${WORK_DIR}/"

cd "${WORK_DIR}"

bun install --frozen-lockfile
bun run tauri:build:linux:appimage

BUNDLE_DIR="${CARGO_TARGET_DIR%/}/release/bundle/appimage"
if [ ! -d "${BUNDLE_DIR}" ]; then
  echo "Error: expected AppImage bundle directory missing: ${BUNDLE_DIR}"
  exit 1
fi

find "${OUT_DIR}" -maxdepth 1 -type f \
  \( -name '*.AppImage' -o -name '*.AppImage.sig' -o -name '*.AppImage.sha256' \) \
  -delete

find "${BUNDLE_DIR}" -maxdepth 1 -type f \
  \( -name '*.AppImage' -o -name '*.AppImage.sig' -o -name '*.AppImage.sha256' \) \
  -exec cp -a {} "${OUT_DIR}/" \;

if [ -n "${HOST_UID}" ] && [ -n "${HOST_GID}" ]; then
  chown -R "${HOST_UID}:${HOST_GID}" "${OUT_DIR}"
fi

echo "AppImage artifacts copied to ${OUT_DIR}:"
find "${OUT_DIR}" -maxdepth 1 -type f -printf '  %f\n' | sort
