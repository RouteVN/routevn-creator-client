#!/bin/bash

# Build script for RouteVN Creator Client
# Usage: ./scripts/build.sh [web|tauri]

set -e

BUILD_TYPE=${1:-web}
SETUP_FILE="src/setup.${BUILD_TYPE}.js"
RETTANGOLI_VERSION="1.0.0-rc14"
RETTANGOLI_URL="https://cdn.jsdelivr.net/npm/@rettangoli/ui@${RETTANGOLI_VERSION}/dist/rettangoli-iife-ui.min.js"
RETTANGOLI_DIR="static/public/@rettangoli/ui@${RETTANGOLI_VERSION}/dist"
RETTANGOLI_FILE="${RETTANGOLI_DIR}/rettangoli-iife-ui.min.js"
LOCAL_RETTANGOLI_FILE="node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js"

echo "Building for ${BUILD_TYPE}..."

echo "Generating bundle file..."
bunx esbuild scripts/main.js --bundle --format=esm --minify --outfile=static/bundle/main.js

# Download Rettangoli UI if needed
echo "Checking Rettangoli UI..."
if [ ! -f "${RETTANGOLI_FILE}" ]; then
  mkdir -p "${RETTANGOLI_DIR}"

  if [ -f "${LOCAL_RETTANGOLI_FILE}" ]; then
    echo "Copying Rettangoli UI v${RETTANGOLI_VERSION} from node_modules..."
    cp "${LOCAL_RETTANGOLI_FILE}" "${RETTANGOLI_FILE}"
  # Download with curl or wget when local package asset is not available
  elif command -v curl >/dev/null 2>&1; then
    echo "Downloading Rettangoli UI v${RETTANGOLI_VERSION}..."
    curl -L -o "${RETTANGOLI_FILE}" "${RETTANGOLI_URL}"
  elif command -v wget >/dev/null 2>&1; then
    echo "Downloading Rettangoli UI v${RETTANGOLI_VERSION}..."
    wget -O "${RETTANGOLI_FILE}" "${RETTANGOLI_URL}"
  else
    echo "Error: Rettangoli UI bundle missing in node_modules and no downloader (curl/wget) available."
    exit 1
  fi

  echo "Rettangoli UI prepared successfully."
else
  echo "Rettangoli UI v${RETTANGOLI_VERSION} already exists."
fi

# Clean and prepare site directory
rm -rf _site
mkdir -p _site
cp -rf static/* _site/

# Build UI components
echo "Building UI components..."
rtgl ui build-svg

# Build frontend bundle
echo "Building frontend bundle with ${SETUP_FILE}..."
rtgl fe build -s "${SETUP_FILE}"

# Prevent stale browser caches from serving an old /public/main.js bundle.
BUILD_REV=$(date +%s)
find _site -type f -name "*.html" -print0 | while IFS= read -r -d '' file; do
  sed -i -E \
    "s#<script type=\"module\" src=\"/public/main.js(\\?v=[^\"]*)?\"></script>#<script type=\"module\" src=\"/public/main.js?v=${BUILD_REV}\"></script>#g" \
    "${file}"
  sed -i -E \
    "s#<script src=\"/public/@rettangoli/ui@[^/]+/dist/rettangoli-iife-ui.min.js(\\?v=[^\"]*)?\"></script>#<script src=\"/public/@rettangoli/ui@${RETTANGOLI_VERSION}/dist/rettangoli-iife-ui.min.js?v=${BUILD_REV}\"></script>#g" \
    "${file}"
done

echo "Build completed for ${BUILD_TYPE}"
