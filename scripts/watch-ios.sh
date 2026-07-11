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

echo "Preparing iOS watch assets..."
bun run build:bundle

if [ ! -f "${RETTANGOLI_FILE}" ]; then
  mkdir -p "${RETTANGOLI_DIR}"

  if [ ! -f "${LOCAL_RETTANGOLI_FILE}" ]; then
    echo "Error: Rettangoli UI bundle is missing from node_modules."
    echo "Run bun install before watching iOS."
    exit 1
  fi

  LOCAL_RETTANGOLI_VERSION=$(node -p "require('./${LOCAL_RETTANGOLI_PACKAGE}').version" 2>/dev/null || true)
  if [ "${LOCAL_RETTANGOLI_VERSION}" != "${RETTANGOLI_VERSION}" ]; then
    echo "Error: node_modules has Rettangoli UI v${LOCAL_RETTANGOLI_VERSION:-unknown}, expected v${RETTANGOLI_VERSION}."
    echo "Run bun install before watching iOS."
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

echo "Building initial iOS frontend bundle..."
"${RTGL_BIN}" fe build -s src/setup.ios.js

echo "iOS debug app URL: http://127.0.0.1:${PORT}/ios/index.html"
echo "In another terminal, run: bun run ios:run -- --dev-server \"http://127.0.0.1:${PORT}/ios/index.html\""
exec "${RTGL_BIN}" fe watch -s src/setup.ios.js -p "${PORT}"
