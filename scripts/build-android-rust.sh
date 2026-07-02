#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_API="${ANDROID_API:-24}"
ANDROID_TARGET="aarch64-linux-android"
ANDROID_ABI="arm64-v8a"
CRATE_MANIFEST="${ROOT_DIR}/crates/routevn-exporter-jni/Cargo.toml"
TARGET_DIR="${ROOT_DIR}/.artifacts/android-rust"
JNI_LIBS_DIR="${ROOT_DIR}/android/routevn/app/src/main/jniLibs/${ANDROID_ABI}"

if [ -n "${ANDROID_NDK_HOME:-}" ]; then
  NDK_HOME="${ANDROID_NDK_HOME}"
elif [ -n "${ANDROID_NDK_ROOT:-}" ]; then
  NDK_HOME="${ANDROID_NDK_ROOT}"
else
  NDK_HOME="${HOME}/Android/Sdk/ndk/29.0.14206865"
fi

if [ ! -d "${NDK_HOME}" ]; then
  echo "Android NDK was not found at ${NDK_HOME}" >&2
  exit 1
fi

case "$(uname -s)" in
  Darwin)
    if [ -d "${NDK_HOME}/toolchains/llvm/prebuilt/darwin-aarch64" ]; then
      HOST_TAG="darwin-aarch64"
    else
      HOST_TAG="darwin-x86_64"
    fi
    ;;
  Linux)
    HOST_TAG="linux-x86_64"
    ;;
  *)
    echo "Unsupported host OS for Android Rust build: $(uname -s)" >&2
    exit 1
    ;;
esac

TOOLCHAIN_BIN="${NDK_HOME}/toolchains/llvm/prebuilt/${HOST_TAG}/bin"
ANDROID_CLANG="${TOOLCHAIN_BIN}/${ANDROID_TARGET}${ANDROID_API}-clang"
ANDROID_AR="${TOOLCHAIN_BIN}/llvm-ar"

if [ ! -x "${ANDROID_CLANG}" ]; then
  echo "Android clang was not found at ${ANDROID_CLANG}" >&2
  exit 1
fi

if [ ! -x "${ANDROID_AR}" ]; then
  echo "Android llvm-ar was not found at ${ANDROID_AR}" >&2
  exit 1
fi

export CC_aarch64_linux_android="${ANDROID_CLANG}"
export AR_aarch64_linux_android="${ANDROID_AR}"
export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="${ANDROID_CLANG}"

cargo build \
  --manifest-path "${CRATE_MANIFEST}" \
  --target "${ANDROID_TARGET}" \
  --release \
  --target-dir "${TARGET_DIR}"

mkdir -p "${JNI_LIBS_DIR}"
cp \
  "${TARGET_DIR}/${ANDROID_TARGET}/release/libroutevn_exporter_jni.so" \
  "${JNI_LIBS_DIR}/libroutevn_exporter_jni.so"

echo "Android Rust library copied to ${JNI_LIBS_DIR}"
