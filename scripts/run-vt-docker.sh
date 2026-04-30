#!/usr/bin/env bash

set -euo pipefail

images=(
  "docker.io/han4wluc/rtgl:playwright-v1.57.0-rtgl-v1.0.12"
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

pull_image_if_missing() {
  local image="$1"

  if docker image inspect "$image" >/dev/null 2>&1; then
    printf '%s\n' "$image"
    return 0
  fi

  if docker pull "$image" </dev/null; then
    printf '%s\n' "$image"
    return 0
  fi

  return 1
}

IMAGE="${RTGL_VT_IMAGE:-}"

if [ -z "$IMAGE" ]; then
  IMAGE="$(pull_image_if_missing "${images[0]}" || true)"
fi

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

export RTGL_VT_RESET_APP_STATE="${RTGL_VT_RESET_APP_STATE:-1}"

env_args=()
while IFS='=' read -r key _; do
  env_args+=("-e" "$key")
done < <(env | grep '^RTGL_VT_' || true)

docker_args=(--rm --pull=never --user "$(id -u):$(id -g)" -v "$PWD:/app" -w /app)
if [ "${#env_args[@]}" -gt 0 ]; then
  docker_args+=("${env_args[@]}")
fi

rtgl_args=("$@")
if [ "${1:-}" = "vt" ] && [ "${2:-}" = "screenshot" ]; then
  has_isolation_flag=0
  has_concurrency_flag=0
  for arg in "${rtgl_args[@]}"; do
    if [ "$arg" = "--isolation" ] || [[ "$arg" == --isolation=* ]]; then
      has_isolation_flag=1
    fi
    if [ "$arg" = "--concurrency" ] || [[ "$arg" == --concurrency=* ]]; then
      has_concurrency_flag=1
    fi
  done

  if [ "$has_isolation_flag" -eq 0 ]; then
    rtgl_args+=(--isolation strict)
  fi
  if [ "$has_concurrency_flag" -eq 0 ]; then
    rtgl_args+=(--concurrency "${RTGL_VT_CONCURRENCY:-1}")
  fi
fi

exec docker run "${docker_args[@]}" "$IMAGE" rtgl "${rtgl_args[@]}"
