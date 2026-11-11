#!/bin/bash

# Tauri `bundle.windows.signCommand` wrapper for Windows builds cross-compiled
# from WSL. Tauri calls it once per file; it signs that file with signtool.exe
# on the Windows host, using a certificate from the Windows certificate store.

set -euo pipefail

FILE="${1:?Usage: sign-windows.sh <file>}"
: "${WINDOWS_SIGN_CERT_SHA1:?Set WINDOWS_SIGN_CERT_SHA1 to the SHA-1 thumbprint of the code signing certificate.}"
: "${WINDOWS_SIGN_TIMESTAMP_URL:?Set WINDOWS_SIGN_TIMESTAMP_URL to the RFC 3161 timestamp server of the certificate authority.}"
SIGNTOOL="${WINDOWS_SIGNTOOL:-/mnt/c/Program Files (x86)/Windows Kits/10/bin/10.0.26100.0/x64/signtool.exe}"

# Tauri also passes bundled resource executables. The player template is
# rewritten by every export, so it ships unsigned and must not be modified in
# the source tree.
if [[ "$(basename "$FILE")" == "RouteVNPlayerTemplate.exe" ]]; then
  echo "sign-windows: leaving $FILE unsigned"
  exit 0
fi

# A certificate held by a cloud or hardware token can be unavailable for a
# moment while its session wakes up, so retry before failing the build.
for attempt in 1 2 3; do
  if "$SIGNTOOL" sign /sha1 "$WINDOWS_SIGN_CERT_SHA1" /tr "$WINDOWS_SIGN_TIMESTAMP_URL" /td sha256 /fd sha256 "$(wslpath -w "$FILE")"; then
    exit 0
  fi
  echo "sign-windows: signing $FILE failed (attempt $attempt of 3)" >&2
  sleep 5
done
exit 1
