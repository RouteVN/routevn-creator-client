#!/bin/bash

set -euo pipefail

export VITE_ROUTEVN_DISTRIBUTION=steam

bun run build:tauri
tauri build \
  --config src-tauri/tauri.steam.conf.json \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --no-bundle

echo "Final Steam Windows executable: src-tauri/target/x86_64-pc-windows-msvc/release/app.exe"
