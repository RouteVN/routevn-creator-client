#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_API="${ANDROID_API:-24}"
ANDROID_NDK_VERSION="${ANDROID_NDK_VERSION:-29.0.14206865}"
ANDROID_ABIS="${ANDROID_ABIS:-arm64-v8a armeabi-v7a x86 x86_64}"
CRATE_MANIFEST="${ROOT_DIR}/crates/routevn-exporter-jni/Cargo.toml"
TARGET_DIR="${ROOT_DIR}/.artifacts/android-rust"
ANDROID_PROJECT_DIR="${ROOT_DIR}/android/routevn"
LOCAL_PROPERTIES="${ANDROID_PROJECT_DIR}/local.properties"
JNI_LIBS_ROOT="${ANDROID_PROJECT_DIR}/app/src/main/jniLibs"

read_local_property() {
  local key="$1"

  if [ ! -f "${LOCAL_PROPERTIES}" ]; then
    return 0
  fi

  awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' \
    "${LOCAL_PROPERTIES}"
}

find_ndk_home() {
  local local_ndk_dir
  local local_sdk_dir
  local candidate
  local sdk_dir
  local sdk_candidates=()
  local ndk_candidates=()

  local_ndk_dir="$(read_local_property "ndk.dir")"
  local_sdk_dir="$(read_local_property "sdk.dir")"

  ndk_candidates+=("${ANDROID_NDK_HOME:-}")
  ndk_candidates+=("${ANDROID_NDK_ROOT:-}")
  ndk_candidates+=("${local_ndk_dir}")

  sdk_candidates+=("${ANDROID_HOME:-}")
  sdk_candidates+=("${ANDROID_SDK_ROOT:-}")
  sdk_candidates+=("${local_sdk_dir}")
  sdk_candidates+=("${HOME}/Android/Sdk")

  for sdk_dir in "${sdk_candidates[@]}"; do
    if [ -n "${sdk_dir}" ]; then
      ndk_candidates+=("${sdk_dir}/ndk/${ANDROID_NDK_VERSION}")
    fi
  done

  for candidate in "${ndk_candidates[@]}"; do
    if [ -n "${candidate}" ] && [ -d "${candidate}" ]; then
      echo "${candidate}"
      return 0
    fi
  done

  echo "Android NDK ${ANDROID_NDK_VERSION} was not found." >&2
  echo "Checked ANDROID_NDK_HOME, ANDROID_NDK_ROOT, android/routevn/local.properties, ANDROID_HOME, ANDROID_SDK_ROOT, and ${HOME}/Android/Sdk." >&2
  exit 1
}

NDK_HOME="$(find_ndk_home)"

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
ANDROID_AR="${TOOLCHAIN_BIN}/llvm-ar"

if [ ! -x "${ANDROID_AR}" ]; then
  echo "Android llvm-ar was not found at ${ANDROID_AR}" >&2
  exit 1
fi

resolve_abi_config() {
  case "$1" in
    arm64-v8a)
      echo "aarch64-linux-android|aarch64-linux-android"
      ;;
    armeabi-v7a)
      echo "armv7-linux-androideabi|armv7a-linux-androideabi"
      ;;
    x86)
      echo "i686-linux-android|i686-linux-android"
      ;;
    x86_64)
      echo "x86_64-linux-android|x86_64-linux-android"
      ;;
    *)
      echo "Unsupported Android ABI: $1" >&2
      exit 1
      ;;
  esac
}

target_env_name() {
  echo "$1" | tr '[:lower:]-' '[:upper:]_'
}

target_cc_env_name() {
  echo "$1" | tr '-' '_'
}

ensure_rust_target() {
  local rust_target="$1"

  if rustup target list --installed | grep -Fxq "${rust_target}"; then
    return 0
  fi

  if [ "${ANDROID_RUST_AUTO_INSTALL_TARGETS:-1}" = "1" ]; then
    rustup target add "${rust_target}"
    return 0
  fi

  echo "Rust target ${rust_target} is not installed." >&2
  echo "Run: rustup target add ${rust_target}" >&2
  exit 1
}

build_abi() {
  local android_abi="$1"
  local config
  local rust_target
  local clang_target
  local clang
  local cargo_env
  local cc_env
  local jni_libs_dir

  config="$(resolve_abi_config "${android_abi}")"
  rust_target="${config%%|*}"
  clang_target="${config#*|}"
  clang="${TOOLCHAIN_BIN}/${clang_target}${ANDROID_API}-clang"
  cargo_env="$(target_env_name "${rust_target}")"
  cc_env="$(target_cc_env_name "${rust_target}")"
  jni_libs_dir="${JNI_LIBS_ROOT}/${android_abi}"

  if [ ! -x "${clang}" ]; then
    echo "Android clang was not found at ${clang}" >&2
    exit 1
  fi

  ensure_rust_target "${rust_target}"

  export "CC_${cc_env}=${clang}"
  export "AR_${cc_env}=${ANDROID_AR}"
  export "CARGO_TARGET_${cargo_env}_LINKER=${clang}"

  cargo build \
    --manifest-path "${CRATE_MANIFEST}" \
    --target "${rust_target}" \
    --release \
    --target-dir "${TARGET_DIR}" \
    --locked

  mkdir -p "${jni_libs_dir}"
  cp \
    "${TARGET_DIR}/${rust_target}/release/libroutevn_exporter_jni.so" \
    "${jni_libs_dir}/libroutevn_exporter_jni.so"

  echo "Android Rust library copied to ${jni_libs_dir}"
}

for android_abi in ${ANDROID_ABIS//,/ }; do
  build_abi "${android_abi}"
done
