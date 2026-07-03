#!/usr/bin/env bash

set -euo pipefail

SRC_DIR="${ROUTEVN_SRC_DIR:-/src}"
WORK_DIR="${ROUTEVN_WORK_DIR:-/work}"
OUT_DIR="${ROUTEVN_OUT_DIR:-/out}"
BUNDLE_KIND="${ROUTEVN_BUNDLE_KIND:-}"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/cache/cargo-target}"
BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-/cache/bun}"
CARGO_HOME="${CARGO_HOME:-/cache/cargo-home}"
HOST_UID="${HOST_UID:-}"
HOST_GID="${HOST_GID:-}"

case "${BUNDLE_KIND}" in
  deb | rpm)
    ;;
  *)
    echo "Error: ROUTEVN_BUNDLE_KIND must be deb or rpm."
    exit 1
    ;;
esac

export CARGO_TARGET_DIR
export BUN_INSTALL_CACHE_DIR
export CARGO_HOME
export RUSTUP_HOME="${RUSTUP_HOME:-/opt/rustup}"
export PATH="/opt/cargo/bin:/opt/bun/bin:/usr/local/bin:${PATH}"

if [ ! -f "${SRC_DIR}/package.json" ]; then
  echo "Error: ${SRC_DIR} does not look like the RouteVN Creator repo."
  exit 1
fi

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}" "${OUT_DIR}" "${BUN_INSTALL_CACHE_DIR}" "${CARGO_HOME}" "${CARGO_TARGET_DIR}"

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
bun run build:tauri

BUNDLE_DIR="${CARGO_TARGET_DIR%/}/release/bundle/${BUNDLE_KIND}"
rm -rf "${BUNDLE_DIR}"

bun run tauri -- build \
  --config src-tauri/tauri.prod.conf.json \
  --config src-tauri/tauri.linux-packages.conf.json \
  --bundles "${BUNDLE_KIND}" \
  --ci

node scripts/validate-linux-packaging.js "--${BUNDLE_KIND}"

if [ ! -d "${BUNDLE_DIR}" ]; then
  echo "Error: expected ${BUNDLE_KIND} bundle directory missing: ${BUNDLE_DIR}"
  exit 1
fi

find "${OUT_DIR}" -maxdepth 1 -type f \
  \( \
    -name "*.deb" \
    -o -name "*.deb.sha256" \
    -o -name "*.deb.sig" \
    -o -name "*.rpm" \
    -o -name "*.rpm.sha256" \
    -o -name "*.rpm.sig" \
  \) \
  -delete

find "${BUNDLE_DIR}" -maxdepth 1 -type f -name "*.${BUNDLE_KIND}" \
  -exec cp -a {} "${OUT_DIR}/" \;

for artifact in "${OUT_DIR}"/*."${BUNDLE_KIND}"; do
  [ -e "${artifact}" ] || continue

  (
    cd "${OUT_DIR}"
    sha256sum "$(basename "${artifact}")" > "$(basename "${artifact}").sha256"
  )
done

if [ -n "${HOST_UID}" ] && [ -n "${HOST_GID}" ]; then
  chown -R "${HOST_UID}:${HOST_GID}" "${OUT_DIR}"
fi

echo "${BUNDLE_KIND} artifacts copied to ${OUT_DIR}:"
find "${OUT_DIR}" -maxdepth 1 -type f -printf '  %f\n' | sort
