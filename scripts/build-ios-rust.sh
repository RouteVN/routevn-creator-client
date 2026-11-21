#!/usr/bin/env bash

set -euo pipefail

if [ "$(uname -s)" != Darwin ]; then
  echo "The iOS Rust build requires macOS with Xcode and the iOS SDKs installed." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRATE_DIR="${ROOT_DIR}/crates/routevn-exporter-ffi"
TARGET_DIR="${ROOT_DIR}/.artifacts/ios-rust"
FRAMEWORK="${ROOT_DIR}/ios/routevn/Frameworks/RouteVNExporterFFI.xcframework"
PROJECT="${ROOT_DIR}/ios/routevn/routevn.xcodeproj/project.pbxproj"

for tool in cargo rustup xcrun xcodebuild; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "The iOS Rust build requires ${tool}. Install Rust and select a full Xcode installation." >&2
    exit 1
  fi
done

# Keep the Rust library's minimum OS version aligned with every app configuration.
IPHONEOS_DEPLOYMENT_TARGET="$(awk '/IPHONEOS_DEPLOYMENT_TARGET =/ { gsub(/;/, "", $3); print $3 }' "${PROJECT}" | sort -u)"
if [[ ! "${IPHONEOS_DEPLOYMENT_TARGET}" =~ ^[0-9]+\.[0-9]+$ ]]; then
  echo "Expected one iOS deployment target in ${PROJECT}." >&2
  exit 1
fi
export IPHONEOS_DEPLOYMENT_TARGET

ensure_rust_target() {
  local rust_target="$1"
  if rustup target list --installed | grep -Fxq "${rust_target}"; then
    return 0
  fi
  if [ "${IOS_RUST_AUTO_INSTALL_TARGETS:-1}" = 1 ]; then
    rustup target add "${rust_target}"
    return 0
  fi
  echo "Rust target ${rust_target} is not installed. Run: rustup target add ${rust_target}" >&2
  exit 1
}

for rust_target in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  ensure_rust_target "${rust_target}"
  cargo build --manifest-path "${CRATE_DIR}/Cargo.toml" \
    --release --locked --target "${rust_target}" --target-dir "${TARGET_DIR}"
done

SIMULATOR_DIR="${TARGET_DIR}/simulator"
mkdir -p "${SIMULATOR_DIR}" "$(dirname "${FRAMEWORK}")"
xcrun lipo -create \
  "${TARGET_DIR}/aarch64-apple-ios-sim/release/libroutevn_exporter_ffi.a" \
  "${TARGET_DIR}/x86_64-apple-ios/release/libroutevn_exporter_ffi.a" \
  -output "${SIMULATOR_DIR}/libroutevn_exporter_ffi.a"

rm -rf "${FRAMEWORK}"
xcodebuild -create-xcframework \
  -library "${TARGET_DIR}/aarch64-apple-ios/release/libroutevn_exporter_ffi.a" \
  -headers "${CRATE_DIR}/include" \
  -library "${SIMULATOR_DIR}/libroutevn_exporter_ffi.a" \
  -headers "${CRATE_DIR}/include" \
  -output "${FRAMEWORK}"

echo "iOS Rust library created at ${FRAMEWORK}"
