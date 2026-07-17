#!/bin/bash

set -e

RTGL_BIN="node_modules/.bin/rtgl"

if [ ! -x "${RTGL_BIN}" ]; then
  echo "Error: local rtgl CLI is missing. Run bun install before watching."
  exit 1
fi

echo "Preparing web watch static assets..."
./scripts/prepare-watch-static-assets.sh

exec "${RTGL_BIN}" fe watch -s src/setup.web.js
