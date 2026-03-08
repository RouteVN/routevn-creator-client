#!/usr/bin/env bash

set -euo pipefail

images=(
  "han4wluc/rtgl:playwright-v1.57.0-rtgl-v1.0.0-rc13"
  "han4wluc/rtgl:playwright-v1.57.0-rtgl-v1.0.0-rc12"
)

find_local_image() {
  local image
  for image in "${images[@]}"; do
    if docker image inspect "$image" >/dev/null 2>&1; then
      printf '%s\n' "$image"
      return 0
    fi
  done

  return 1
}

pull_image() {
  local image
  for image in "${images[@]}"; do
    if docker pull "$image" </dev/null; then
      printf '%s\n' "$image"
      return 0
    fi
  done

  return 1
}

IMAGE="${RTGL_VT_IMAGE:-}"

if [ -z "$IMAGE" ]; then
  IMAGE="$(find_local_image || true)"
fi

if [ -z "$IMAGE" ]; then
  IMAGE="$(pull_image || true)"
fi

if [ -z "$IMAGE" ]; then
  echo "No usable Rettangoli VT Docker image found." >&2
  exit 1
fi

env_args=()
while IFS='=' read -r key _; do
  env_args+=("-e" "$key")
done < <(env | grep '^RTGL_VT_' || true)

exec docker run --rm --pull=never --user "$(id -u):$(id -g)" "${env_args[@]}" -v "$PWD:/app" -w /app "$IMAGE" rtgl "$@"
