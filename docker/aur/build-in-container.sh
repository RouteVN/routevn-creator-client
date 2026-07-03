#!/usr/bin/env bash

set -euo pipefail

SRC_DIR="${ROUTEVN_SRC_DIR:-/src}"
WORK_DIR="${ROUTEVN_WORK_DIR:-/work}"
OUT_DIR="${ROUTEVN_OUT_DIR:-/out}"
PKG_NAME="routevn-creator"
AUR_BUILD_DIR="${WORK_DIR}/aur-build"
BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-/cache/bun}"
CARGO_HOME="${CARGO_HOME:-/cache/cargo-home}"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-/cache/cargo-target}"
HOST_UID="${HOST_UID:-}"
HOST_GID="${HOST_GID:-}"

export BUN_INSTALL_CACHE_DIR
export CARGO_HOME
export CARGO_TARGET_DIR

if [ ! -f "${SRC_DIR}/package.json" ]; then
  echo "Error: ${SRC_DIR} does not look like the RouteVN Creator repo."
  exit 1
fi

if [ ! -d "${SRC_DIR}/.git" ]; then
  echo "Error: ${SRC_DIR}/.git is required because AUR source archives are created from HEAD."
  exit 1
fi

APP_VERSION="$(bun --print "JSON.parse(await Bun.file('${SRC_DIR}/src-tauri/tauri.conf.json').text()).version")"
ARCHIVE_FILE="${PKG_NAME}-${APP_VERSION}.tar.gz"
PKGBUILD_SOURCE="${SRC_DIR}/packaging/aur/PKGBUILD"

if ! grep -q "^pkgver=${APP_VERSION}$" "${PKGBUILD_SOURCE}"; then
  echo "Error: ${PKGBUILD_SOURCE} pkgver does not match Tauri version ${APP_VERSION}."
  exit 1
fi

if [ -n "$(git -c safe.directory="${SRC_DIR}" -C "${SRC_DIR}" status --porcelain)" ]; then
  echo "Warning: uncommitted changes are not included. AUR source archive is created from HEAD."
fi

rm -rf "${AUR_BUILD_DIR}"
mkdir -p "${AUR_BUILD_DIR}" "${OUT_DIR}" "${BUN_INSTALL_CACHE_DIR}" "${CARGO_HOME}" "${CARGO_TARGET_DIR}"

git -c safe.directory="${SRC_DIR}" -C "${SRC_DIR}" archive \
  --format=tar.gz \
  --prefix="${PKG_NAME}-${APP_VERSION}/" \
  --output="${AUR_BUILD_DIR}/${ARCHIVE_FILE}" \
  HEAD

cp "${PKGBUILD_SOURCE}" "${AUR_BUILD_DIR}/PKGBUILD"
sed -i "s|^source=.*|source=(\"${ARCHIVE_FILE}\")|" "${AUR_BUILD_DIR}/PKGBUILD"

chown -R builder:builder "${WORK_DIR}" "${BUN_INSTALL_CACHE_DIR}" "${CARGO_HOME}" "${CARGO_TARGET_DIR}"

run_as_builder() {
  runuser -u builder -- env \
    HOME=/home/builder \
    BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR}" \
    CARGO_HOME="${CARGO_HOME}" \
    CARGO_TARGET_DIR="${CARGO_TARGET_DIR}" \
    PATH="${PATH}" \
    bash -lc "$1"
}

run_as_builder "cd '${AUR_BUILD_DIR}' && makepkg --force --cleanbuild"
run_as_builder "cd '${AUR_BUILD_DIR}' && makepkg --printsrcinfo > .SRCINFO"

find "${OUT_DIR}" -maxdepth 1 -type f \
  \( -name "${PKG_NAME}-*.pkg.tar.*" -o -name "${PKG_NAME}-*.pkg.tar.*.sha256" \) \
  -delete

find "${AUR_BUILD_DIR}" -maxdepth 1 -type f -name "*.pkg.tar.*" \
  -exec cp -a {} "${OUT_DIR}/" \;

cp "${AUR_BUILD_DIR}/PKGBUILD" "${OUT_DIR}/PKGBUILD"
cp "${AUR_BUILD_DIR}/.SRCINFO" "${OUT_DIR}/.SRCINFO"

for artifact in "${OUT_DIR}"/*.pkg.tar.*; do
  [ -e "${artifact}" ] || continue

  case "${artifact}" in
    *.sha256)
      continue
      ;;
  esac

  (
    cd "${OUT_DIR}"
    sha256sum "$(basename "${artifact}")" > "$(basename "${artifact}").sha256"
  )
done

if [ -n "${HOST_UID}" ] && [ -n "${HOST_GID}" ]; then
  chown -R "${HOST_UID}:${HOST_GID}" "${OUT_DIR}"
fi

echo "AUR package artifacts copied to ${OUT_DIR}:"
find "${OUT_DIR}" -maxdepth 1 -type f -printf '  %f\n' | sort
