#!/usr/bin/env bash

set -euo pipefail

SRC_DIR="${ROUTEVN_SRC_DIR:-/src}"
WORK_DIR="${ROUTEVN_WORK_DIR:-/work}"
OUT_DIR="${ROUTEVN_OUT_DIR:-/out}"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/cache/cargo-target}"
BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-/cache/bun}"
CARGO_HOME="${CARGO_HOME:-/cache/cargo-home}"
XDG_CACHE_HOME="${XDG_CACHE_HOME:-/cache/xdg}"
HOST_UID="${HOST_UID:-}"
HOST_GID="${HOST_GID:-}"
TEMPLATE_PATH="src-tauri/assets/player-templates/windows/RouteVNPlayerTemplate.exe"

export CARGO_TARGET_DIR
export BUN_INSTALL_CACHE_DIR
export CARGO_HOME
export XDG_CACHE_HOME
export RUSTUP_HOME="${RUSTUP_HOME:-/opt/rustup}"
export PATH="/opt/cargo/bin:/opt/bun/bin:/usr/local/bin:${PATH}"

if [ ! -f "${SRC_DIR}/package.json" ]; then
  echo "Error: ${SRC_DIR} does not look like the RouteVN Creator repo."
  exit 1
fi

if ! command -v llvm-rc >/dev/null 2>&1; then
  echo "Error: llvm-rc is required to build the Windows player template."
  exit 1
fi

if ! command -v clang-cl >/dev/null 2>&1; then
  echo "Error: clang-cl is required to build the Windows player template."
  exit 1
fi

rm -rf "${WORK_DIR}"
mkdir -p \
  "${WORK_DIR}" \
  "${OUT_DIR}" \
  "${BUN_INSTALL_CACHE_DIR}" \
  "${CARGO_HOME}" \
  "${CARGO_TARGET_DIR}" \
  "${XDG_CACHE_HOME}"

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '_site' \
  --exclude '.rettangoli/vt/_site' \
  --exclude 'src-tauri/target' \
  --exclude 'crates/routevn-packager/target' \
  --exclude 'crates/routevn-packager/tauri-shell/src-tauri/target' \
  --exclude 'test-results' \
  "${SRC_DIR}/" "${WORK_DIR}/"

cd "${WORK_DIR}"

bun install --frozen-lockfile
bun run player-template:build:win

if [ ! -f "${TEMPLATE_PATH}" ]; then
  echo "Error: expected Windows player template missing: ${TEMPLATE_PATH}"
  exit 1
fi

cp -a "${TEMPLATE_PATH}" "${OUT_DIR}/RouteVNPlayerTemplate.exe"

if [ -n "${HOST_UID}" ] && [ -n "${HOST_GID}" ]; then
  chown -R "${HOST_UID}:${HOST_GID}" "${OUT_DIR}"
fi

echo "Windows player template copied to ${OUT_DIR}/RouteVNPlayerTemplate.exe"
