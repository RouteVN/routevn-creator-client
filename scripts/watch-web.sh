#!/bin/bash

set -e

PORT="${PORT:-3001}"
JS_RUNTIME="node"
if ! command -v node >/dev/null 2>&1; then
  if command -v bun >/dev/null 2>&1; then
    JS_RUNTIME="bun"
  elif [ -x "$HOME/.bun/bin/bun" ]; then
    JS_RUNTIME="$HOME/.bun/bin/bun"
  fi
fi

RETTANGOLI_PACKAGE_INFO=$(${JS_RUNTIME} scripts/resolve-rettangoli-ui-package.js)
IFS=$'\t' read -r RETTANGOLI_PACKAGE_DIR RETTANGOLI_VERSION RETTANGOLI_IS_LOCAL <<< "${RETTANGOLI_PACKAGE_INFO}"

LOCAL_RETTANGOLI_PACKAGE="${RETTANGOLI_PACKAGE_DIR}/package.json"
LOCAL_RETTANGOLI_FILE="${RETTANGOLI_PACKAGE_DIR}/dist/rettangoli-iife-ui.min.js"

RTGL_BIN="node_modules/.bin/rtgl"
RETTANGOLI_DIR="static/public/@rettangoli/ui@${RETTANGOLI_VERSION}/dist"
RETTANGOLI_FILE="${RETTANGOLI_DIR}/rettangoli-iife-ui.min.js"

if [ ! -x "${RTGL_BIN}" ]; then
  echo "Error: local rtgl CLI is missing. Run bun install before watching."
  exit 1
fi

echo "Preparing Web watch static assets..."

if [ "${RETTANGOLI_IS_LOCAL}" = true ]; then
  if [ ! -f "${LOCAL_RETTANGOLI_FILE}" ]; then
    echo "Error: local Rettangoli UI bundle is missing at ${LOCAL_RETTANGOLI_FILE}."
    exit 1
  fi
  mkdir -p "${RETTANGOLI_DIR}"
  cp "${LOCAL_RETTANGOLI_FILE}" "${RETTANGOLI_FILE}"
elif [ ! -f "${RETTANGOLI_FILE}" ]; then
  mkdir -p "${RETTANGOLI_DIR}"
  if [ -f "${LOCAL_RETTANGOLI_FILE}" ]; then
    cp "${LOCAL_RETTANGOLI_FILE}" "${RETTANGOLI_FILE}"
  elif command -v curl >/dev/null 2>&1; then
    curl -L -o "${RETTANGOLI_FILE}" "https://cdn.jsdelivr.net/npm/@rettangoli/ui@${RETTANGOLI_VERSION}/dist/rettangoli-iife-ui.min.js"
  fi
fi

"${RTGL_BIN}" ui build-svg

mkdir -p _site
cp -rf static/. _site/

exec "${RTGL_BIN}" fe watch -s src/setup.web.js "$@"
