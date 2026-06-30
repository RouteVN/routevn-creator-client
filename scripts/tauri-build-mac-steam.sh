#!/bin/bash

set -euo pipefail

has_notarization_credentials() {
  [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]
}

read_tauri_config_value() {
  bun --print "JSON.parse(await Bun.file('src-tauri/tauri.conf.json').text()).${1}"
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
APP_PATH="src-tauri/target/universal-apple-darwin/release/bundle/macos/${APP_NAME}.app"

echo "Building Steam macOS app with signing identity: ${APPLE_SIGNING_IDENTITY}"

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

export VITE_ROUTEVN_DISTRIBUTION=steam

bun run build:tauri
tauri build \
  --config src-tauri/tauri.steam.conf.json \
  --target universal-apple-darwin \
  --bundles app

if [ ! -d "${APP_PATH}" ]; then
  echo "Error: no macOS app bundle found at ${APP_PATH}."
  exit 1
fi

echo "Final Steam macOS app: ${APP_PATH}"
