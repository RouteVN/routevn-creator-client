#!/bin/bash

set -e

RTGL_BIN="node_modules/.bin/rtgl"

if [ ! -x "${RTGL_BIN}" ]; then
  echo "Error: local rtgl CLI is missing. Run bun install before watching."
  exit 1
fi

echo "Preparing Tauri watch static assets..."
mkdir -p _site
cp -rf static/. _site/

exec "${RTGL_BIN}" fe watch -s src/setup.tauri.js
