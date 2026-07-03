#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_NAME="routevn-creator"
AUR_OUT_DIR="${ROUTEVN_AUR_OUT_DIR:-${ROOT_DIR}/dist/aur}"
AUR_BUILD_DIR="${AUR_OUT_DIR}/build"
PKGBUILD_SOURCE="${ROOT_DIR}/packaging/aur/PKGBUILD"

read_tauri_config_value() {
  bun --print "JSON.parse(await Bun.file('src-tauri/tauri.conf.json').text()).${1}"
}

if ! command -v makepkg >/dev/null 2>&1; then
  echo "Error: makepkg is required for the AUR build."
  echo "Install base-devel on Arch Linux before running this command."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required to create the AUR source archive."
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is required to read Tauri metadata."
  exit 1
fi

APP_VERSION="$(read_tauri_config_value "version")"
ARCHIVE_FILE="${PKG_NAME}-${APP_VERSION}.tar.gz"

if ! grep -q "^pkgver=${APP_VERSION}$" "${PKGBUILD_SOURCE}"; then
  echo "Error: ${PKGBUILD_SOURCE} pkgver does not match Tauri version ${APP_VERSION}."
  exit 1
fi

if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
  echo "Warning: uncommitted changes are not included. AUR source archive is created from HEAD."
fi

rm -rf "${AUR_BUILD_DIR}"
mkdir -p "${AUR_BUILD_DIR}"

git -C "${ROOT_DIR}" archive \
  --format=tar.gz \
  --prefix="${PKG_NAME}-${APP_VERSION}/" \
  --output="${AUR_BUILD_DIR}/${ARCHIVE_FILE}" \
  HEAD

cp "${PKGBUILD_SOURCE}" "${AUR_BUILD_DIR}/PKGBUILD"
sed -i "s|^source=.*|source=(\"${ARCHIVE_FILE}\")|" "${AUR_BUILD_DIR}/PKGBUILD"

(
  cd "${AUR_BUILD_DIR}"
  makepkg --force --cleanbuild --syncdeps
  makepkg --printsrcinfo > .SRCINFO
)

find "${AUR_BUILD_DIR}" -maxdepth 1 -type f -name "*.pkg.tar.*" -exec cp -f {} "${AUR_OUT_DIR}/" \;

echo "Arch package artifacts are in ${AUR_OUT_DIR}"
echo "AUR build workspace is ${AUR_BUILD_DIR}"
