#!/bin/bash

set -euo pipefail

WINDOWS_RELEASE_DIR="src-tauri/target/x86_64-pc-windows-msvc/release"

export VITE_ROUTEVN_DISTRIBUTION=steam

bun run build:tauri
tauri build \
  --config src-tauri/tauri.steam.conf.json \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --no-bundle

echo "Final Steam Windows executable: ${WINDOWS_RELEASE_DIR}/app.exe"
echo "Requires Microsoft Edge WebView2 Runtime on the target Windows machine."
