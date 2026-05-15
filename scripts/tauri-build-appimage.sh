#!/bin/bash

set -euo pipefail

load_env() {
  if [ -f ".env" ]; then
    set -a
    # shellcheck disable=SC1091
    . ./.env
    set +a
  fi
}

prepare_gdk_pixbuf_pkg_config() {
  if ! command -v pkg-config >/dev/null 2>&1; then
    return
  fi

  local binary_dir
  binary_dir=$(pkg-config --variable=gdk_pixbuf_binarydir gdk-pixbuf-2.0 2>/dev/null || true)

  if [ -z "${binary_dir}" ] || [ -d "${binary_dir}" ]; then
    return
  fi

  local pc_file
  local pc_dir
  local override_dir
  local override_binary_dir

  pc_dir=$(pkg-config --variable=pcfiledir gdk-pixbuf-2.0)
  pc_file="${pc_dir}/gdk-pixbuf-2.0.pc"
  override_dir="/tmp/routevn-appimage-pkgconfig"
  override_binary_dir="/tmp/routevn-appimage-gdk-pixbuf/2.10.0"

  if [ ! -f "${pc_file}" ]; then
    return
  fi

  echo "Using temporary gdk-pixbuf pkg-config override for AppImage bundling."
  mkdir -p "${override_dir}" "${override_binary_dir}/loaders"
  cp "${pc_file}" "${override_dir}/gdk-pixbuf-2.0.pc"
  sed -i "s#^gdk_pixbuf_binarydir=.*#gdk_pixbuf_binarydir=${override_binary_dir}#" "${override_dir}/gdk-pixbuf-2.0.pc"
  sed -i 's#^gdk_pixbuf_moduledir=.*#gdk_pixbuf_moduledir=${gdk_pixbuf_binarydir}/loaders#' "${override_dir}/gdk-pixbuf-2.0.pc"
  sed -i 's#^gdk_pixbuf_cache_file=.*#gdk_pixbuf_cache_file=${gdk_pixbuf_binarydir}/loaders.cache#' "${override_dir}/gdk-pixbuf-2.0.pc"

  export PKG_CONFIG_PATH="${override_dir}${PKG_CONFIG_PATH:+:${PKG_CONFIG_PATH}}"
}

write_appimage_checksum() {
  local bundle_dir="src-tauri/target/release/bundle/appimage"
  local appimage
  local appimage_path
  local appimage_file
  local checksum_file
  local appimages=()

  while IFS= read -r -d '' appimage; do
    appimages+=("${appimage}")
  done < <(find "${bundle_dir}" -maxdepth 1 -type f -name "*.AppImage" -print0)

  if [ "${#appimages[@]}" -eq 0 ]; then
    echo "Error: no AppImage found in ${bundle_dir}."
    exit 1
  fi

  appimage_path="${appimages[0]}"
  for appimage in "${appimages[@]}"; do
    if [ "${appimage}" -nt "${appimage_path}" ]; then
      appimage_path="${appimage}"
    fi
  done

  appimage_file=$(basename "${appimage_path}")
  checksum_file="${appimage_file}.sha256"

  (
    cd "${bundle_dir}"
    sha256sum "${appimage_file}" > "${checksum_file}"
  )

  echo "SHA256 checksum: ${bundle_dir}/${checksum_file}"
}

load_env

if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  echo "Error: TAURI_SIGNING_PRIVATE_KEY is not set. Add it to .env before building the AppImage."
  exit 1
fi

if [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD+x}" ] && [ -t 0 ]; then
  printf "TAURI_SIGNING_PRIVATE_KEY_PASSWORD (press Enter for none): "
  IFS= read -r -s TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  printf "\n"
fi

export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

bun run build:tauri
prepare_gdk_pixbuf_pkg_config

export NO_STRIP="${NO_STRIP:-1}"

tauri build --config src-tauri/tauri.prod.conf.json --bundles appimage
write_appimage_checksum
