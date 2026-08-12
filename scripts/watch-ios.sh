#!/bin/bash

set -e

PORT="3001"
RETTANGOLI_SPEC=$(node -e '
const spec = require("./package.json").dependencies?.["@rettangoli/ui"];
if (!spec) {
  console.error("Error: @rettangoli/ui is missing from package.json dependencies.");
  process.exit(1);
}
process.stdout.write(spec);
')

if [[ "${RETTANGOLI_SPEC}" == file:* ]]; then
  RETTANGOLI_PACKAGE_DIR="${RETTANGOLI_SPEC#file:}"
  RETTANGOLI_IS_LOCAL=true
else
  RETTANGOLI_PACKAGE_DIR="node_modules/@rettangoli/ui"
  RETTANGOLI_IS_LOCAL=false
fi

LOCAL_RETTANGOLI_PACKAGE="${RETTANGOLI_PACKAGE_DIR}/package.json"
LOCAL_RETTANGOLI_FILE="${RETTANGOLI_PACKAGE_DIR}/dist/rettangoli-iife-ui.min.js"
RETTANGOLI_VERSION=$(node -e '
const packagePath = process.argv[1];
const packageJson = require(require("node:path").resolve(packagePath));
process.stdout.write(packageJson.version);
' "${LOCAL_RETTANGOLI_PACKAGE}")

RTGL_BIN="node_modules/.bin/rtgl"
RETTANGOLI_DIR="static/public/@rettangoli/ui@${RETTANGOLI_VERSION}/dist"
RETTANGOLI_FILE="${RETTANGOLI_DIR}/rettangoli-iife-ui.min.js"

if [ ! -x "${RTGL_BIN}" ]; then
  echo "Error: local rtgl CLI is missing. Run bun install before watching."
  exit 1
fi

echo "Preparing iOS watch assets..."
bun run build:bundle

if [ "${RETTANGOLI_IS_LOCAL}" = true ]; then
  if [ ! -f "${LOCAL_RETTANGOLI_FILE}" ]; then
    echo "Error: local Rettangoli UI bundle is missing at ${LOCAL_RETTANGOLI_FILE}."
    echo "Build the local @rettangoli/ui package before watching iOS."
    exit 1
  fi

  mkdir -p "${RETTANGOLI_DIR}"
  cp "${LOCAL_RETTANGOLI_FILE}" "${RETTANGOLI_FILE}"
elif [ ! -f "${RETTANGOLI_FILE}" ]; then
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
