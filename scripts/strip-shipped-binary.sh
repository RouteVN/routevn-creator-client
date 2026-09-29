#!/usr/bin/env bash
# Strip debug info from the release desktop binary before it is bundled, after
# the debug file needed for crash symbols has been kept. Run it between
# `tauri build --no-bundle` and `scripts/upload-crash-symbols.sh`.
#
# macOS: Cargo already wrote the dSYM (split-debuginfo = "packed"); drop the
#        debug map that still points at local object files. The UUID is kept.
# Linux: copy the DWARF and symbol table to <binary>.debug, then strip the
#        binary. The GNU build ID stays in both files and is the debug ID.
# Windows has nothing to do: the PDB is already a separate file.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"
PLATFORM="${1:?Usage: scripts/strip-shipped-binary.sh <macos|linux>}"
BINARY_NAME="$(node -p "require('./src-tauri/tauri.conf.json').mainBinaryName")"
TARGET_DIR="${CARGO_TARGET_DIR:-${ROOT_DIR}/src-tauri/target}"

has_debug_info() {
  readelf -S "$1" | grep '\.debug_info' >/dev/null
}

build_id() {
  readelf -n "$1" | awk '/Build ID:/ { print $3; exit }'
}

case "${PLATFORM}" in
  macos)
    stripped=0
    for binary in "${TARGET_DIR}/release/${BINARY_NAME}" "${TARGET_DIR}"/*/release/"${BINARY_NAME}"; do
      [ -f "${binary}" ] || continue
      strip -S "${binary}"
      stripped=$((stripped + 1))
    done
    [ "${stripped}" -gt 0 ] || { echo "No release binary under ${TARGET_DIR}" >&2; exit 1; }
    ;;
  linux)
    binary="${TARGET_DIR}/release/${BINARY_NAME}"
    debug_file="${binary}.debug"
    [ -f "${binary}" ] || { echo "Missing ${binary}" >&2; exit 1; }
    id="$(build_id "${binary}")"
    [ -n "${id}" ] || { echo "${binary} has no GNU build ID; link with -Wl,--build-id" >&2; exit 1; }
    if has_debug_info "${binary}"; then
      objcopy --only-keep-debug "${binary}" "${debug_file}"
      strip --strip-debug "${binary}"
    elif [ ! -f "${debug_file}" ] || [ "$(build_id "${debug_file}")" != "${id}" ]; then
      # Cargo did not relink, so the binary was stripped by an earlier run.
      echo "${binary} has no debug info and no matching ${debug_file}" >&2
      exit 1
    fi
    has_debug_info "${debug_file}" || { echo "${debug_file} has no debug info" >&2; exit 1; }
    ;;
  *)
    echo "Expected macos or linux" >&2
    exit 1
    ;;
esac
