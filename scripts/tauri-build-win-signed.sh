#!/bin/bash

# Cross-compiles the Windows release like `tauri:build:win`, and has Tauri sign
# the application executable, the uninstaller, and the installer during the
# build. Run it from WSL on the Windows host that holds the certificate.

set -euo pipefail

# Tauri needs an absolute path to the sign command.
SIGN_COMMAND="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/sign-windows.sh"

# Fail before the build when signing cannot run.
"$SIGN_COMMAND" --check

SIGN_CONFIG="$(SIGN_COMMAND="$SIGN_COMMAND" node -e 'console.log(JSON.stringify({ bundle: { windows: { signCommand: { cmd: process.env.SIGN_COMMAND, args: ["%1"] } } } }))')"

# The extra config is appended to the `tauri build` command of `tauri:build:win`.
bun run tauri:build:win --config "$SIGN_CONFIG"
