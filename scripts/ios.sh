#!/bin/bash

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="${PROJECT_DIR}/ios/routevn"
SCHEME="routevn"
CONFIGURATION="Debug"
DEFAULT_SIMULATOR="iPhone 17"
SIMULATOR_NAME="${IOS_SIMULATOR:-$DEFAULT_SIMULATOR}"
SIMULATOR_UDID="${IOS_SIMULATOR_UDID:-}"
IOS_DEV_SERVER_URL="${IOS_DEV_SERVER_URL:-}"
IOS_SMOKE_TEST="${IOS_SMOKE_TEST:-}"
IOS_INITIAL_PATH="${IOS_INITIAL_PATH:-}"
BUNDLE_ID="com.routevn.creator"
COMMAND="${1:-build}"

usage() {
  echo "Usage: $0 [build|run|install|launch|devices|clean] [--simulator NAME] [--udid UDID] [--dev-server URL] [--smoke-test] [--initial-path PATH]"
}

shift_command_args() {
  if [ $# -gt 0 ]; then
    shift
  fi
  while [ $# -gt 0 ]; do
    case "$1" in
      --simulator)
        SIMULATOR_NAME="$2"
        shift 2
        ;;
      --udid)
        SIMULATOR_UDID="$2"
        shift 2
        ;;
      --dev-server)
        IOS_DEV_SERVER_URL="$2"
        shift 2
        ;;
      --smoke-test)
        IOS_SMOKE_TEST="1"
        shift
        ;;
      --initial-path)
        IOS_INITIAL_PATH="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done
}

find_simulator_udid() {
  if [ -n "$SIMULATOR_UDID" ]; then
    echo "$SIMULATOR_UDID"
    return
  fi

  local udid
  udid=$(xcrun simctl list devices available | grep "$SIMULATOR_NAME" | head -n 1 | sed -E 's/.*\(([A-Z0-9-]+)\).*/\1/')
  if [ -z "$udid" ]; then
    echo "Could not find simulator named '$SIMULATOR_NAME'. Available iPhone/iPad simulators:" >&2
    xcrun simctl list devices available | grep -E "iPhone|iPad" >&2
    exit 1
  fi

  echo "$udid"
}

app_path() {
  find "${PROJECT_DIR}/ios/routevn/build" -name "routevn.app" -path "*Debug-iphonesimulator*" | head -n 1
}

build_app() {
  local udid
  udid=$(find_simulator_udid)
  cd "$PROJECT_DIR"
  bun run build:ios
  cd "$IOS_DIR"
  xcodebuild \
    -project routevn.xcodeproj \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=${udid}" \
    -derivedDataPath build \
    CODE_SIGNING_ALLOWED=NO \
    build
}

install_app() {
  local udid
  udid=$(find_simulator_udid)
  local built_app
  built_app=$(app_path)
  if [ -z "$built_app" ]; then
    echo "Could not find built routevn.app. Run: bun run ios:build"
    exit 1
  fi

  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator
  xcrun simctl install "$udid" "$built_app"
}

launch_app() {
  local udid
  udid=$(find_simulator_udid)
  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator
  local launch_env=()
  if [ -n "$IOS_DEV_SERVER_URL" ]; then
    launch_env+=(SIMCTL_CHILD_ROUTEVN_IOS_DEV_SERVER_URL="$IOS_DEV_SERVER_URL")
  fi
  if [ -n "$IOS_SMOKE_TEST" ]; then
    launch_env+=(SIMCTL_CHILD_ROUTEVN_IOS_SMOKE_TEST="1")
  fi
  if [ -n "$IOS_INITIAL_PATH" ]; then
    launch_env+=(SIMCTL_CHILD_ROUTEVN_IOS_INITIAL_PATH="$IOS_INITIAL_PATH")
  fi

  env "${launch_env[@]}" xcrun simctl launch --terminate-running-process "$udid" "$BUNDLE_ID"
}

clean_app() {
  rm -rf "${IOS_DIR}/build"
  xcodebuild -project "${IOS_DIR}/routevn.xcodeproj" -scheme "$SCHEME" clean
}

shift_command_args "$@"

case "$COMMAND" in
  build)
    build_app
    ;;
  run)
    build_app
    install_app
    launch_app
    ;;
  install)
    install_app
    ;;
  launch)
    launch_app
    ;;
  devices)
    xcrun simctl list devices available
    ;;
  clean)
    clean_app
    ;;
  -h|--help)
    usage
    ;;
  *)
    echo "Unknown command: $COMMAND"
    usage
    exit 1
    ;;
esac
