#!/bin/bash

set -e

PORT="3001"
RETTANGOLI_VERSION=$(node -p "require('./package.json').dependencies['@rettangoli/ui']" 2>/dev/null || echo "1.9.1")
RETTANGOLI_VERSION="${RETTANGOLI_VERSION#^}"
RETTANGOLI_VERSION="${RETTANGOLI_VERSION#~}"

RTGL_BIN="node_modules/.bin/rtgl"
RETTANGOLI_DIR="static/public/@rettangoli/ui@${RETTANGOLI_VERSION}/dist"
RETTANGOLI_FILE="${RETTANGOLI_DIR}/rettangoli-iife-ui.min.js"
LOCAL_RETTANGOLI_PACKAGE="node_modules/@rettangoli/ui/package.json"
LOCAL_RETTANGOLI_FILE="node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js"

if [ ! -x "${RTGL_BIN}" ]; then
  echo "Error: local rtgl CLI is missing. Run bun install before watching."
  exit 1
fi

echo "Preparing Android watch assets..."
bun run build:bundle

if [ ! -f "${RETTANGOLI_FILE}" ]; then
  mkdir -p "${RETTANGOLI_DIR}"

  if [ ! -f "${LOCAL_RETTANGOLI_FILE}" ]; then
    echo "Error: Rettangoli UI bundle is missing from node_modules."
    echo "Run bun install before watching Android."
    exit 1
  fi

  LOCAL_RETTANGOLI_VERSION=$(node -p "require('./${LOCAL_RETTANGOLI_PACKAGE}').version" 2>/dev/null || true)
  if [ "${LOCAL_RETTANGOLI_VERSION}" != "${RETTANGOLI_VERSION}" ]; then
    echo "Error: node_modules has Rettangoli UI v${LOCAL_RETTANGOLI_VERSION:-unknown}, expected v${RETTANGOLI_VERSION}."
    echo "Run bun install before watching Android."
    exit 1
  fi

  cp "${LOCAL_RETTANGOLI_FILE}" "${RETTANGOLI_FILE}"
fi

rm -rf _site
mkdir -p _site
cp -rf static/* _site/

"${RTGL_BIN}" ui build-svg
mkdir -p _site/public
cp -f static/public/rtgl-icons.js _site/public/rtgl-icons.js

echo "Building initial Android frontend bundle..."
"${RTGL_BIN}" fe build -s src/setup.android.js

if command -v adb >/dev/null 2>&1; then
  ADB_ARGS=()
  if [ -n "${ANDROID_SERIAL:-}" ]; then
    ADB_ARGS=(-s "${ANDROID_SERIAL}")
  fi

  if adb "${ADB_ARGS[@]}" get-state >/dev/null 2>&1; then
    if adb "${ADB_ARGS[@]}" reverse "tcp:${PORT}" "tcp:${PORT}" >/dev/null 2>&1; then
      echo "ADB reverse active: tcp:${PORT} -> tcp:${PORT}"
    else
      echo "Warning: failed to configure adb reverse for tcp:${PORT}."
    fi
  else
    echo "No Android device detected for adb reverse. Connect a device or run: adb reverse tcp:${PORT} tcp:${PORT}"
  fi
else
  echo "adb not found. Install Android platform tools or run adb reverse manually."
fi

echo "Android debug app URL: http://127.0.0.1:${PORT}/android/index.html"
exec "${RTGL_BIN}" fe watch -s src/setup.android.js -p "${PORT}"
