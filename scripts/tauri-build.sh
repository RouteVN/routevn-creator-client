#!/usr/bin/env bash
# Host-native direct desktop build with crash symbols (macOS or Linux).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

case "$(uname -s)" in
  Darwin) platform=macos ;;
  Linux)
    platform=linux
    # Linux keeps DWARF in the binary until strip-shipped-binary.sh splits it.
    export CARGO_PROFILE_RELEASE_SPLIT_DEBUGINFO=off
    ;;
  *) echo "Use tauri:build:win on Windows hosts" >&2; exit 1 ;;
esac

export VITE_ROUTEVN_DISTRIBUTION=direct
export ROUTEVN_CRASH_SYMBOLS=1
bun run build:tauri
tauri build --config src-tauri/tauri.prod.conf.json --no-bundle
bash scripts/strip-shipped-binary.sh "${platform}"
bash scripts/upload-crash-symbols.sh "${platform}"
tauri bundle --config src-tauri/tauri.prod.conf.json
