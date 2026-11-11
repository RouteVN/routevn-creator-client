#!/bin/bash

# Cross-compiles the Windows release like `tauri:build:win`, and has Tauri sign
# the application executable, the uninstaller, and the installer during the
# build. Run it from WSL on the Windows host that holds the certificate.

set -euo pipefail

: "${WINDOWS_SIGN_CERT_SHA1:?Set WINDOWS_SIGN_CERT_SHA1 to the SHA-1 thumbprint of the code signing certificate.}"
: "${WINDOWS_SIGN_TIMESTAMP_URL:?Set WINDOWS_SIGN_TIMESTAMP_URL to the RFC 3161 timestamp server of the certificate authority.}"

# Tauri needs an absolute path to the sign command.
SIGN_COMMAND="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/sign-windows.sh"
SIGN_CONFIG="$(SIGN_COMMAND="$SIGN_COMMAND" node -e 'console.log(JSON.stringify({ bundle: { windows: { signCommand: { cmd: process.env.SIGN_COMMAND, args: ["%1"] } } } }))')"

bun run build:tauri
tauri build \
  --config src-tauri/tauri.prod.conf.json \
  --config "$SIGN_CONFIG" \
  --runner cargo-xwin \
  --target x86_64-pc-windows-msvc
