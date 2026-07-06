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

get_target_dir() {
  if [ -n "${CARGO_TARGET_DIR:-}" ]; then
    echo "${CARGO_TARGET_DIR%/}"
    return
  fi

  echo "src-tauri/target"
}

get_appimage_bundle_dir() {
  echo "$(get_target_dir)/release/bundle/appimage"
}

find_single_appdir() {
  local bundle_dir
  local appdir
  local appdirs=()

  bundle_dir="$(get_appimage_bundle_dir)"

  while IFS= read -r -d '' appdir; do
    appdirs+=("${appdir}")
  done < <(find "${bundle_dir}" -maxdepth 1 -type d -name "*.AppDir" -print0)

  if [ "${#appdirs[@]}" -ne 1 ]; then
    echo "Error: expected one AppDir in ${bundle_dir}, found ${#appdirs[@]}." >&2
    exit 1
  fi

  echo "${appdirs[0]}"
}

find_latest_appimage() {
  local bundle_dir
  local appimage
  local appimage_path
  local appimages=()

  bundle_dir="$(get_appimage_bundle_dir)"

  while IFS= read -r -d '' appimage; do
    appimages+=("${appimage}")
  done < <(find "${bundle_dir}" -maxdepth 1 -type f -name "*.AppImage" -print0)

  if [ "${#appimages[@]}" -eq 0 ]; then
    echo "Error: no AppImage found in ${bundle_dir}." >&2
    exit 1
  fi

  appimage_path="${appimages[0]}"
  for appimage in "${appimages[@]}"; do
    if [ "${appimage}" -nt "${appimage_path}" ]; then
      appimage_path="${appimage}"
    fi
  done

  echo "${appimage_path}"
}

ensure_appimage_output_plugin() {
  local target_dir
  local tool_dir
  local appimage_plugin

  if command -v linuxdeploy-plugin-appimage >/dev/null 2>&1; then
    command -v linuxdeploy-plugin-appimage
    return
  fi

  target_dir="$(get_target_dir)"
  tool_dir="${target_dir}/appimage-tools"
  appimage_plugin="${tool_dir}/linuxdeploy-plugin-appimage-x86_64.AppImage"

  mkdir -p "${tool_dir}"
  if [ ! -x "${appimage_plugin}" ]; then
    curl -fsSL \
      -o "${appimage_plugin}" \
      "https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage"
    chmod +x "${appimage_plugin}"
  fi

  echo "${appimage_plugin}"
}

# Temporary workaround while waiting for Tauri to expose linuxdeploy's
# --exclude-library option as bundle.linux.appimage.excludeLibraries:
# https://github.com/tauri-apps/tauri/pull/15662
remove_bundled_graphics_stack() {
  local appdir
  local lib_dir
  local bundled_lib
  local removed_count=0
  local patterns=(
    "libEGL*.so*"
    "libGLES*.so*"
    "libGL*.so*"
    "libGLX*.so*"
    "libGLdispatch*.so*"
    "libgbm*.so*"
    "libdrm*.so*"
    "libwayland-client.so*"
    "libwayland-cursor.so*"
    "libwayland-egl.so*"
    "libwayland-server.so*"
  )

  appdir="$1"

  while IFS= read -r -d '' lib_dir; do
    for pattern in "${patterns[@]}"; do
      while IFS= read -r -d '' bundled_lib; do
        rm -f "${bundled_lib}"
        removed_count=$((removed_count + 1))
      done < <(
        find "${lib_dir}" \
          -maxdepth 1 \
          \( -type f -o -type l \) \
          -name "${pattern}" \
          -print0
      )
    done
  done < <(find "${appdir}/usr/lib" -maxdepth 2 -type d -print0)

  echo "Removed ${removed_count} bundled graphics stack libraries from ${appdir}."
}

repack_appimage() {
  local appdir
  local appimage_path
  local appimage_plugin
  local bundle_dir
  local generated_appimage
  local appimage_file

  appdir="$(find_single_appdir)"
  appimage_path="$(find_latest_appimage)"
  appimage_plugin="$(ensure_appimage_output_plugin)"
  bundle_dir="$(get_appimage_bundle_dir)"
  appimage_file="$(basename "${appimage_path}")"

  remove_bundled_graphics_stack "${appdir}"
  rm -f "${appimage_path}" "${appimage_path}.sig" "${appimage_path}.sha256"

  (
    cd "${bundle_dir}"
    ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "${appimage_plugin}" --appdir="${appdir}"
  )

  generated_appimage="$(find_latest_appimage)"
  if [ "${generated_appimage}" != "${appimage_path}" ]; then
    mv "${generated_appimage}" "${appimage_path}"
  fi

  tauri signer sign "${appimage_path}" >/dev/null

  echo "Repacked AppImage without bundled graphics stack: ${appimage_file}"
}

write_appimage_checksum() {
  local bundle_dir
  local appimage_path
  local appimage_file
  local checksum_file

  appimage_path="$(find_latest_appimage)"
  bundle_dir="$(get_appimage_bundle_dir)"
  appimage_file=$(basename "${appimage_path}")
  checksum_file="${appimage_file}.sha256"

  (
    cd "${bundle_dir}"
    sha256sum "${appimage_file}" > "${checksum_file}"
  )

  echo "SHA256 checksum: ${bundle_dir}/${checksum_file}"
}

load_env

if ! command -v patchelf >/dev/null 2>&1; then
  echo "Error: patchelf is required for AppImage media framework bundling."
  echo "Install it before building the AppImage. On Ubuntu: sudo apt install patchelf"
  exit 1
fi

if [ ! -x "/usr/bin/xdg-open" ]; then
  echo "Error: /usr/bin/xdg-open is required for AppImage bundling because tauri-plugin-opener is enabled."
  echo "Install xdg-utils before building the AppImage."
  echo "Ubuntu/Debian: sudo apt install xdg-utils"
  echo "Fedora: sudo dnf install xdg-utils"
  echo "Arch: sudo pacman -S xdg-utils"
  exit 1
fi

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

export NO_STRIP="${NO_STRIP:-1}"

tauri build --config src-tauri/tauri.prod.conf.json --bundles appimage
repack_appimage
write_appimage_checksum
