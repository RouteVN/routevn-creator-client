#!/bin/bash

set -euo pipefail

WINDOWS_RELEASE_DIR="src-tauri/target/x86_64-pc-windows-msvc/release"

export VITE_ROUTEVN_DISTRIBUTION=steam
export ROUTEVN_CRASH_SYMBOLS=1
export ROUTEVN_SYMBOLS_PLATFORM=windows

bun run build:tauri
tauri build \
  --config src-tauri/tauri.steam.conf.json \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --no-bundle
bash scripts/upload-crash-symbols.sh windows

echo "Final Steam Windows executable: ${WINDOWS_RELEASE_DIR}/routevn-creator.exe"
echo "Requires Microsoft Edge WebView2 Runtime on the target Windows machine."
