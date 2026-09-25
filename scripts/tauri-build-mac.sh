#!/bin/bash

set -euo pipefail

has_notarization_credentials() {
  [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]
}

read_tauri_config_value() {
  bun --print "JSON.parse(await Bun.file('src-tauri/tauri.conf.json').text()).${1}"
}

normalize_macos_updater_artifact_name() {
  local artifact_dir="${1}"
  local app_name="${2}"
  local app_version="${3}"
  local source_path="${artifact_dir}/${app_name}.app.tar.gz"
  local target_path="${artifact_dir}/${app_name}_${app_version}.app.tar.gz"
  local source_sig_path="${source_path}.sig"
  local target_sig_path="${target_path}.sig"

  if [ -f "${source_path}" ]; then
    mv -f "${source_path}" "${target_path}"
    echo "Final app updater archive: ${target_path}"
  elif [ -f "${target_path}" ]; then
    echo "Final app updater archive: ${target_path}"
  else
    echo "Warning: no app updater archive found in ${artifact_dir}."
  fi

  if [ -f "${source_sig_path}" ]; then
    mv -f "${source_sig_path}" "${target_sig_path}"
    echo "Final app updater signature: ${target_sig_path}"
  elif [ -f "${target_sig_path}" ]; then
    echo "Final app updater signature: ${target_sig_path}"
  fi
}

if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "Error: APPLE_SIGNING_IDENTITY is not set. Add it to .env."
  exit 1
fi

APP_NAME=$(read_tauri_config_value "productName")
APP_VERSION=$(read_tauri_config_value "version")

echo "Building macOS bundle with signing identity: ${APPLE_SIGNING_IDENTITY}"

if has_notarization_credentials; then
  if ! xcrun notarytool --version >/dev/null 2>&1; then
    echo "Error: xcrun notarytool is required for notarization."
    exit 1
  fi

  echo "Notarization enabled with APPLE_ID credentials for team: ${APPLE_TEAM_ID}"
else
  echo "Warning: notarization is not configured."
  echo "Set APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID in .env."
fi

node scripts/prepare-macos-player-template-release.js
bun run build:tauri
tauri build \
  --config src-tauri/tauri.prod.conf.json \
  --config src-tauri/tauri.macos-release.conf.json \
  --target universal-apple-darwin \
  --bundles app,dmg

MACOS_BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle/macos"
DMG_DIR="src-tauri/target/universal-apple-darwin/release/bundle/dmg"
normalize_macos_updater_artifact_name "${MACOS_BUNDLE_DIR}" "${APP_NAME}" "${APP_VERSION}"

DMG_PATH=$(find "${DMG_DIR}" -maxdepth 1 -type f -name "*.dmg" -print | sort | tail -n 1)

if [ -z "${DMG_PATH}" ]; then
  echo "Error: no DMG found in ${DMG_DIR}."
  exit 1
fi

echo "Final DMG: ${DMG_PATH}"

if has_notarization_credentials; then
  echo "Notarizing DMG: ${DMG_PATH}"
  xcrun notarytool submit "${DMG_PATH}" \
    --apple-id "${APPLE_ID}" \
    --password "${APPLE_PASSWORD}" \
    --team-id "${APPLE_TEAM_ID}" \
    --wait

  echo "Stapling DMG..."
  xcrun stapler staple "${DMG_PATH}"

  echo "Validating stapled DMG..."
  xcrun stapler validate "${DMG_PATH}"
  spctl -a -vvv -t install "${DMG_PATH}"
fi
