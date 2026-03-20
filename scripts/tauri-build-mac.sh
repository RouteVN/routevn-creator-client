#!/bin/bash

set -euo pipefail

has_notarization_credentials() {
  [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]
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

bun run build:tauri
tauri build --config src-tauri/tauri.prod.conf.json --target universal-apple-darwin --bundles dmg

DMG_DIR="src-tauri/target/universal-apple-darwin/release/bundle/dmg"
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
