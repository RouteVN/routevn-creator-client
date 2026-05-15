#!/bin/bash

set -euo pipefail

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

bun run build:tauri
prepare_gdk_pixbuf_pkg_config

export NO_STRIP="${NO_STRIP:-1}"

sign_args=()
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  sign_args+=(--no-sign)
fi

tauri build --config src-tauri/tauri.prod.conf.json --bundles appimage "${sign_args[@]}"
