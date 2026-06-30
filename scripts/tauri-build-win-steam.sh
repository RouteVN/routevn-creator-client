#!/bin/bash

set -euo pipefail

WEBVIEW2_FIXED_RUNTIME_DIR="src-tauri/steam-runtime/webview2"
WINDOWS_RELEASE_DIR="src-tauri/target/x86_64-pc-windows-msvc/release"

if [ ! -d "${WEBVIEW2_FIXED_RUNTIME_DIR}" ]; then
  echo "Error: WebView2 fixed runtime is required for the raw Windows Steam executable."
  echo "Extract the Microsoft Edge WebView2 Fixed Version Runtime to:"
  echo "  ${WEBVIEW2_FIXED_RUNTIME_DIR}"
  exit 1
fi

if [ ! -f "${WEBVIEW2_FIXED_RUNTIME_DIR}/msedgewebview2.exe" ]; then
  echo "Error: ${WEBVIEW2_FIXED_RUNTIME_DIR}/msedgewebview2.exe was not found."
  echo "The fixed runtime folder must contain the extracted WebView2 runtime files directly."
  exit 1
fi

export VITE_ROUTEVN_DISTRIBUTION=steam

bun run build:tauri
tauri build \
  --config src-tauri/tauri.steam.conf.json \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc \
  --no-bundle

if [ ! -d "${WINDOWS_RELEASE_DIR}/steam-runtime/webview2" ]; then
  echo "Error: fixed WebView2 runtime was not copied to ${WINDOWS_RELEASE_DIR}/steam-runtime/webview2."
  exit 1
fi

echo "Final Steam Windows executable: ${WINDOWS_RELEASE_DIR}/app.exe"
echo "Staged WebView2 fixed runtime: ${WINDOWS_RELEASE_DIR}/steam-runtime/webview2"
