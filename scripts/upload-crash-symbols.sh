#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
PLATFORM="${1:?Usage: scripts/upload-crash-symbols.sh <web|macos|linux|windows|ios|android>}"
command -v routevn-symbols >/dev/null || { echo "routevn-symbols is required" >&2; exit 1; }
# Plan mode (the default) never touches AWS; only an executed upload needs credentials.
if [ "${ROUTEVN_SYMBOLS_UPLOAD:-0}" = 1 ]; then
  : "${ROUTEVN_SYMBOLS_AWS_PROFILE:?Set ROUTEVN_SYMBOLS_AWS_PROFILE to the AWS profile for symbols}"
  command -v aws >/dev/null || { echo "AWS CLI is required" >&2; exit 1; }
fi

IFS=$'\t' read -r RELEASE DIST < <(node scripts/crash-symbols-info.js "${PLATFORM}")
SYMBOLS_DIR="${ROOT_DIR}/.artifacts/crash-symbols/${PLATFORM}/${RELEASE}-${DIST}"
JS_DIR="${SYMBOLS_DIR}/js"
if [ ! -d "${JS_DIR}" ] || ! find "${JS_DIR}" -type f -name '*.map' -print -quit | grep -q .; then
  echo "Missing JavaScript source maps in ${JS_DIR}" >&2
  exit 1
fi

NATIVE_DIR="${SYMBOLS_DIR}/native"
TARGET_DIR="${CARGO_TARGET_DIR:-${ROOT_DIR}/src-tauri/target}"
BINARY_NAME="$(node -p "require('./src-tauri/tauri.conf.json').mainBinaryName")"
case "${PLATFORM}" in
  web) ;;
  macos)
    rm -rf "${NATIVE_DIR}"
    mkdir -p "${NATIVE_DIR}"
    # Cargo links release/<name>.dSYM to deps/<crate>-<hash>.dSYM, so follow it.
    while IFS= read -r -d '' dsym; do
      relative_path="${dsym#${TARGET_DIR}/}"
      mkdir -p "${NATIVE_DIR}/$(dirname "${relative_path}")"
      cp -RL "${dsym}" "${NATIVE_DIR}/${relative_path}"
    done < <(find "${TARGET_DIR}" -path '*/release/*' \( -type d -o -type l \) -name "${BINARY_NAME}.dSYM" -print0)
    if ! find "${NATIVE_DIR}" -type d -name '*.dSYM' -print -quit | grep -q .; then
      echo "Missing macOS dSYMs" >&2; exit 1
    fi
    ;;
  linux)
    rm -rf "${NATIVE_DIR}"
    mkdir -p "${NATIVE_DIR}"
    # Written by scripts/strip-shipped-binary.sh linux.
    cp "${ROUTEVN_SYMBOLS_NATIVE_FILE:-${TARGET_DIR}/release/${BINARY_NAME}.debug}" "${NATIVE_DIR}/${BINARY_NAME}.debug"
    ;;
  windows)
    rm -rf "${NATIVE_DIR}"
    mkdir -p "${NATIVE_DIR}"
    # rustc names the PDB after the crate, so hyphens become underscores.
    PDB_FILE="${TARGET_DIR}/x86_64-pc-windows-msvc/release/${BINARY_NAME//-/_}.pdb"
    [ -f "${PDB_FILE}" ] || { echo "Missing ${PDB_FILE}" >&2; exit 1; }
    cp "${PDB_FILE}" "${NATIVE_DIR}/${BINARY_NAME}.pdb"
    ;;
  ios)
    VERSION="${RELEASE#routevn-creator@}"
    ARCHIVE="${ROUTEVN_IOS_ARCHIVE_PATH:-${ROOT_DIR}/.artifacts/ios-release/${VERSION}-${DIST}/RouteVN-Creator.xcarchive}"
    [ -d "${ARCHIVE}/dSYMs" ] || { echo "Missing iOS archive dSYMs" >&2; exit 1; }
    ;;
  android)
    VERSION="${RELEASE#routevn-creator@}"
    ANDROID_DIR="${ROOT_DIR}/.artifacts/android-crash-symbols/${VERSION}-${DIST}"
    [ -f "${ANDROID_DIR}/mapping.txt" ] || { echo "Missing Android mapping.txt" >&2; exit 1; }
    [ -d "${ANDROID_DIR}/native" ] || { echo "Missing unstripped Android JNI libraries" >&2; exit 1; }
    PROGUARD_UUID="$(tr -d '\r\n' < "${ANDROID_DIR}/proguard-uuid.txt")"
    [[ "${PROGUARD_UUID}" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "Invalid ProGuard UUID" >&2; exit 1; }
    ;;
esac

# The CLI accepts AWS's standard environment variables; keep the profile name
# operator supplied and avoid persisting exported credentials to disk.
if [ "${ROUTEVN_SYMBOLS_UPLOAD:-0}" = 1 ]; then
  AWS_EXPORTS="$(aws configure export-credentials --profile "${ROUTEVN_SYMBOLS_AWS_PROFILE}" --format env)"
  eval "${AWS_EXPORTS}"
fi

upload() {
  local sentry_platform="$1"
  shift
  local args=(upload --release "${RELEASE}" --dist "${DIST}" --platform "${sentry_platform}" --bucket routevn-telemetry-history-343218223945-ap-northeast-1-an)
  if [ "${sentry_platform}" = java ]; then args+=(--proguard-uuid "${PROGUARD_UUID}"); fi
  if [ "${ROUTEVN_SYMBOLS_UPLOAD:-0}" = 1 ]; then args+=(--execute); fi
  routevn-symbols "${args[@]}" "$@"
}

upload javascript "${JS_DIR}"
case "${PLATFORM}" in
  web) ;;
  macos|linux|windows) upload native "${NATIVE_DIR}" ;;
  ios) upload cocoa "${ARCHIVE}/dSYMs" ;;
  android)
    upload java "${ANDROID_DIR}/mapping.txt"
    upload native "${ANDROID_DIR}/native"
    ;;
esac
