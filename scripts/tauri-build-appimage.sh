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
write_appimage_checksum
