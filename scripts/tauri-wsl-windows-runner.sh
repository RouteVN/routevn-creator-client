#!/usr/bin/env bash

set -euo pipefail

is_wsl=false
if [[ -n "${WSL_DISTRO_NAME:-}" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
  is_wsl=true
fi

if [[ "${is_wsl}" != true ]] || [[ "${1:-}" != "run" ]]; then
  exec cargo-xwin "$@"
fi

build_args=("$@")
build_args[0]="build"

cargo_args=()
app_args=()
after_separator=false

for arg in "${build_args[@]}"; do
  if [[ "${arg}" == "--" && "${after_separator}" == false ]]; then
    after_separator=true
    continue
  fi

  if [[ "${after_separator}" == true ]]; then
    app_args+=("${arg}")
  else
    cargo_args+=("${arg}")
  fi
done

cargo-xwin "${cargo_args[@]}"

target="x86_64-pc-windows-msvc"
profile_dir="debug"
manifest_path=""
target_dir=""

for ((index = 0; index < ${#cargo_args[@]}; index++)); do
  case "${cargo_args[$index]}" in
    --target)
      index=$((index + 1))
      target="${cargo_args[$index]}"
      ;;
    --target=*)
      target="${cargo_args[$index]#--target=}"
      ;;
    --manifest-path)
      index=$((index + 1))
      manifest_path="${cargo_args[$index]}"
      ;;
    --manifest-path=*)
      manifest_path="${cargo_args[$index]#--manifest-path=}"
      ;;
    --target-dir)
      index=$((index + 1))
      target_dir="${cargo_args[$index]}"
      ;;
    --target-dir=*)
      target_dir="${cargo_args[$index]#--target-dir=}"
      ;;
    --release | -r)
      profile_dir="release"
      ;;
    --profile)
      index=$((index + 1))
      profile_dir="${cargo_args[$index]}"
      ;;
    --profile=*)
      profile_dir="${cargo_args[$index]#--profile=}"
      ;;
  esac
done

if [[ "${profile_dir}" == "dev" ]]; then
  profile_dir="debug"
fi

if [[ -n "${manifest_path}" ]]; then
  manifest_dir="$(dirname "$(realpath "${manifest_path}")")"
else
  manifest_dir="$(pwd)"
fi

if [[ -n "${target_dir}" ]]; then
  target_root="$(realpath "${target_dir}")"
elif [[ -n "${CARGO_TARGET_DIR:-}" ]]; then
  target_root="$(realpath "${CARGO_TARGET_DIR}")"
else
  target_root="${manifest_dir}/target"
fi

exe_path="${target_root}/${target}/${profile_dir}/app.exe"
if [[ ! -f "${exe_path}" ]]; then
  exe_path="$(find "${target_root}/${target}/${profile_dir}" -maxdepth 1 -type f -name "*.exe" -print -quit)"
fi

if [[ -z "${exe_path}" ]] || [[ ! -f "${exe_path}" ]]; then
  echo "Could not find built Windows executable under ${target_root}/${target}/${profile_dir}" >&2
  exit 1
fi

cmd_runner="$(command -v cmd.exe || true)"
if [[ -z "${cmd_runner}" ]]; then
  for candidate in /mnt/c/Windows/System32/cmd.exe /mnt/c/WINDOWS/System32/cmd.exe; do
    if [[ -x "${candidate}" ]]; then
      cmd_runner="${candidate}"
      break
    fi
  done
fi

if [[ -z "${cmd_runner}" ]]; then
  echo "cmd.exe is not available. Run this command from WSL with Windows interop enabled." >&2
  exit 1
fi

windows_exe="$(wslpath -w "${exe_path}")"
windows_dir="$(wslpath -w "$(dirname "${exe_path}")")"

echo "Launching Windows app through WSL interop: ${windows_exe}"
if [[ "${windows_dir}" == \\\\* ]]; then
  "${cmd_runner}" /C start "" /WAIT "${windows_exe}" "${app_args[@]}"
else
  "${cmd_runner}" /C start "" /D "${windows_dir}" /WAIT "${windows_exe}" "${app_args[@]}"
fi
