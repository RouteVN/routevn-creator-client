#!/bin/bash

# Tauri `bundle.windows.signCommand` wrapper for Windows builds cross-compiled
# from WSL. Tauri calls it once per file; it signs that file with signtool.exe
# on the Windows host, using a certificate from the Windows certificate store.
# `sign-windows.sh --check` only verifies that signing can run.

set -euo pipefail

FILE="${1:?Usage: sign-windows.sh <file>|--check}"
: "${WINDOWS_SIGN_CERT_SHA1:?Set WINDOWS_SIGN_CERT_SHA1 to the SHA-1 thumbprint of the code signing certificate.}"
: "${WINDOWS_SIGN_TIMESTAMP_URL:?Set WINDOWS_SIGN_TIMESTAMP_URL to the RFC 3161 timestamp server of the certificate authority.}"

if ! command -v wslpath >/dev/null; then
  echo "sign-windows: wslpath not found; run this from WSL on the Windows host." >&2
  exit 1
fi

# WINDOWS_SIGNTOOL overrides; otherwise use the newest installed Windows SDK.
SIGNTOOL="${WINDOWS_SIGNTOOL:-}"
if [[ -z "$SIGNTOOL" ]]; then
  SIGNTOOL="$(ls -d "/mnt/c/Program Files (x86)/Windows Kits/10/bin"/*/x64/signtool.exe 2>/dev/null | sort -V | tail -n 1)"
fi
if [[ ! -x "$SIGNTOOL" ]]; then
  echo "sign-windows: signtool.exe not found; install the Windows SDK or set WINDOWS_SIGNTOOL to its WSL path." >&2
  exit 1
fi

if [[ "$FILE" == "--check" ]]; then
  echo "sign-windows: using $SIGNTOOL"
  exit 0
fi

# Tauri also passes bundled resource executables. The player template is
# rewritten by every export, so it ships unsigned and must not be modified in
# the source tree.
if [[ "$(basename "$FILE")" == "RouteVNPlayerTemplate.exe" ]]; then
  echo "sign-windows: leaving $FILE unsigned"
  exit 0
fi

WINDOWS_FILE="$(wslpath -aw "$FILE")"

# Signing can fail transiently, so retry before failing the build.
ATTEMPTS=3
for attempt in $(seq 1 "$ATTEMPTS"); do
  if "$SIGNTOOL" sign /sha1 "$WINDOWS_SIGN_CERT_SHA1" /tr "$WINDOWS_SIGN_TIMESTAMP_URL" /td sha256 /fd sha256 "$WINDOWS_FILE"; then
    exit 0
  fi
  echo "sign-windows: signing $FILE failed (attempt $attempt of $ATTEMPTS)" >&2
  if [[ "$attempt" -lt "$ATTEMPTS" ]]; then
    sleep 5
  fi
done
exit 1
