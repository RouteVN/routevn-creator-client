#!/bin/bash

# Build script for RouteVN Creator Client
# Usage: ./scripts/build.sh [web|tauri|android|ios]

set -e

BUILD_TYPE=${1:-web}
SETUP_FILE="src/setup.${BUILD_TYPE}.js"
RETTANGOLI_VERSION=$(node -p "require('./package.json').dependencies['@rettangoli/ui']" 2>/dev/null || echo "1.7.5")
RETTANGOLI_VERSION="${RETTANGOLI_VERSION#^}"
RETTANGOLI_VERSION="${RETTANGOLI_VERSION#~}"

RETTANGOLI_URL="https://cdn.jsdelivr.net/npm/@rettangoli/ui@${RETTANGOLI_VERSION}/dist/rettangoli-iife-ui.min.js"
RETTANGOLI_DIR="static/public/@rettangoli/ui@${RETTANGOLI_VERSION}/dist"
RETTANGOLI_FILE="${RETTANGOLI_DIR}/rettangoli-iife-ui.min.js"
LOCAL_RETTANGOLI_PACKAGE="node_modules/@rettangoli/ui/package.json"
LOCAL_RETTANGOLI_FILE="node_modules/@rettangoli/ui/dist/rettangoli-iife-ui.min.js"
LOCK_FILE="/tmp/routevn-creator-client-build.lock"
RTGL_BIN="node_modules/.bin/rtgl"

echo "Building for ${BUILD_TYPE}..."

if [ ! -x "${RTGL_BIN}" ]; then
  echo "Error: local rtgl CLI is missing. Run bun install before building."
  exit 1
fi

sed_in_place() {
  local expression=$1
  local file=$2

  if sed --version >/dev/null 2>&1; then
    sed -i -E "${expression}" "${file}"
    return
  fi

  sed -i '' -E "${expression}" "${file}"
}

# Builds for web/tauri share the same _site output path.
# Serialize concurrent invocations so parallel scripts don't race on _site.
if command -v flock >/dev/null 2>&1; then
  exec 9>"${LOCK_FILE}"
  flock 9
fi

echo "Generating bundle file..."
bun run build:bundle

# Download Rettangoli UI if needed
echo "Checking Rettangoli UI..."
if [ ! -f "${RETTANGOLI_FILE}" ]; then
  mkdir -p "${RETTANGOLI_DIR}"

  if [ -f "${LOCAL_RETTANGOLI_FILE}" ]; then
    LOCAL_RETTANGOLI_VERSION=$(node -p "require('./${LOCAL_RETTANGOLI_PACKAGE}').version" 2>/dev/null || true)
    if [ "${LOCAL_RETTANGOLI_VERSION}" != "${RETTANGOLI_VERSION}" ]; then
      echo "Error: node_modules has Rettangoli UI v${LOCAL_RETTANGOLI_VERSION:-unknown}, expected v${RETTANGOLI_VERSION}."
      echo "Run bun install before building so the local Rettangoli UI bundle matches package.json."
      exit 1
    fi

    echo "Verified Rettangoli UI v${LOCAL_RETTANGOLI_VERSION} in node_modules."
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
"${RTGL_BIN}" ui build-svg
mkdir -p _site/public
cp -f static/public/rtgl-icons.js _site/public/rtgl-icons.js

# Build frontend bundle
echo "Building frontend bundle with ${SETUP_FILE}..."
"${RTGL_BIN}" fe build -s "${SETUP_FILE}"

# Prevent stale browser caches from serving an old /public/main.js bundle.
BUILD_REV=$(date +%s)
find _site -type f -name "*.html" -print0 | while IFS= read -r -d '' file; do
  sed_in_place \
    "s#<script type=\"module\" src=\"/public/main.js(\\?v=[^\"]*)?\"></script>#<script type=\"module\" src=\"/public/main.js?v=${BUILD_REV}\"></script>#g" \
    "${file}"
  sed_in_place \
    "s#<script src=\"/public/@rettangoli/ui@[^/]+/dist/rettangoli-iife-ui.min.js(\\?v=[^\"]*)?\"></script>#<script src=\"/public/@rettangoli/ui@${RETTANGOLI_VERSION}/dist/rettangoli-iife-ui.min.js?v=${BUILD_REV}\"></script>#g" \
    "${file}"
done

if [ "${BUILD_TYPE}" = "android" ]; then
  echo "Preparing Android assets..."
  bun run build:android:assets
fi

if [ "${BUILD_TYPE}" = "ios" ]; then
  echo "Preparing iOS assets..."
  bun run build:ios:assets
fi

echo "Build completed for ${BUILD_TYPE}"
