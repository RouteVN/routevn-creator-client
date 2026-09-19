#!/bin/bash

set -eo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_DIR="${PROJECT_DIR}/ios/routevn"
SCHEME="routevn"
CONFIGURATION="Debug"
DEFAULT_SIMULATOR="iPhone 17"
SIMULATOR_NAME="${IOS_SIMULATOR:-$DEFAULT_SIMULATOR}"
SIMULATOR_UDID="${IOS_SIMULATOR_UDID:-}"
TARGET="device"
if [ -n "${IOS_SIMULATOR:-}${IOS_SIMULATOR_UDID:-}" ]; then TARGET="simulator"; fi
DEVICE_UDID="${IOS_DEVICE_UDID:-}"
DEVELOPMENT_TEAM="${IOS_DEVELOPMENT_TEAM:-}"
IOS_DEV_SERVER_URL="${IOS_DEV_SERVER_URL:-}"
IOS_SMOKE_TEST="${IOS_SMOKE_TEST:-}"
IOS_INITIAL_PATH="${IOS_INITIAL_PATH:-}"
BUNDLE_ID="com.routevn.creator"
COMMAND="${1:-build}"

usage() {
  echo "Usage: $0 [build|run|install|launch|dev|packaged|devices|clean] [--device UDID] [--team TEAM_ID] [--simulator NAME] [--udid SIMULATOR_UDID] [--dev-server URL] [--smoke-test] [--initial-path PATH]"
  echo "Defaults to the connected USB iPhone. dev/launch never build or install."
}

shift_command_args() {
  if [ $# -gt 0 ]; then
    shift
  fi
  while [ $# -gt 0 ]; do
    case "$1" in
      --)
        shift
        ;;
      --device)
        TARGET="device"
        DEVICE_UDID="$2"
        shift 2
        ;;
      --team)
        DEVELOPMENT_TEAM="$2"
        shift 2
        ;;
      --simulator)
        TARGET="simulator"
        SIMULATOR_NAME="$2"
        shift 2
        ;;
      --udid)
        TARGET="simulator"
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

find_device_udid() {
  if [ -n "$DEVICE_UDID" ]; then
    echo "$DEVICE_UDID"
    return
  fi
  ios-deploy --detect --no-wifi --timeout 3 --json | node -e '
    const fs = require("node:fs");
    const output = fs.readFileSync(0, "utf8");
    const ids = [...new Set([...output.matchAll(/"DeviceIdentifier"\s*:\s*"([^"]+)"/g)].map((match) => match[1]))];
    if (ids.length !== 1) {
      console.error(ids.length ? "Multiple iPhones connected. Select one with --device UDID." : "No USB iPhone found. Connect and trust the iPhone, then try again.");
      process.exit(1);
    }
    console.log(ids[0]);
  '
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
  local sdk="iphoneos"
  if [ "$TARGET" = simulator ]; then sdk="iphonesimulator"; fi
  echo "${IOS_DIR}/build/Build/Products/${CONFIGURATION}-${sdk}/routevn.app"
}

build_app() {
  cd "$PROJECT_DIR"
  if [ "$TARGET" = device ]; then
    if [ -z "$DEVELOPMENT_TEAM" ]; then
      echo "Set IOS_DEVELOPMENT_TEAM or pass --team TEAM_ID for a signed iPhone build." >&2
      exit 1
    fi
    bun run build:ios
    xcodebuild -project "${IOS_DIR}/routevn.xcodeproj" -scheme "$SCHEME" \
      -configuration "$CONFIGURATION" -sdk iphoneos -destination 'generic/platform=iOS' \
      -derivedDataPath "${IOS_DIR}/build" \
      DEVELOPMENT_TEAM="$DEVELOPMENT_TEAM" CODE_SIGN_STYLE=Automatic build
    return
  fi
  local udid
  udid=$(find_simulator_udid)
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
  local built_app
  built_app=$(app_path)
  if [ ! -d "$built_app" ]; then
    echo "Could not find built routevn.app. Run: bun run ios:build"
    exit 1
  fi

  if [ "$TARGET" = device ]; then
    ios-deploy --id "$DEVICE_UDID" --bundle "$built_app" --timeout 15
    return
  fi

  local udid
  udid=$(find_simulator_udid)
  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator
  xcrun simctl install "$udid" "$built_app"
}

save_device_dev_configuration() {
  local config_file
  config_file=$(mktemp "${TMPDIR:-/tmp/}routevn-ios-dev.XXXXXX")
  node -e '
    const fs = require("node:fs");
    const [file, url] = process.argv.slice(1);
    if (url) {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error("Use an HTTP(S) dev-server URL without credentials.");
      }
    }
    fs.writeFileSync(file, JSON.stringify({ url }));
  ' "$config_file" "$IOS_DEV_SERVER_URL"
  local result=0
  ios-deploy --id "$DEVICE_UDID" --bundle_id "$BUNDLE_ID" --timeout 15 \
    --upload "$config_file" --to /Library/routevn-dev.json || result=$?
  rm -f "$config_file"
  return "$result"
}

launch_app() {
  if [ "$TARGET" = device ]; then
    local built_app
    built_app=$(app_path)
    if [ ! -d "$built_app" ]; then
      echo "The matching Debug app bundle is needed to launch. Run bun run ios:build -- --team TEAM_ID." >&2
      exit 1
    fi
    local device_env=()
    local device_env_values=()
    if [ -n "$IOS_SMOKE_TEST" ]; then device_env_values+=("ROUTEVN_IOS_SMOKE_TEST=1"); fi
    if [ -n "$IOS_INITIAL_PATH" ]; then device_env_values+=("ROUTEVN_IOS_INITIAL_PATH=${IOS_INITIAL_PATH}"); fi
    if [ -n "${ROUTEVN_UPDATE_API_URL:-}" ]; then device_env_values+=("ROUTEVN_UPDATE_API_URL=${ROUTEVN_UPDATE_API_URL}"); fi
    if [ ${#device_env_values[@]} -gt 0 ]; then device_env=(--envs "${device_env_values[*]}"); fi
    # On iOS 16, LLDB can leave a successfully launched app paused. Detach
    # directly to resume it; ios-deploy's safequit accepts only running apps.
    # ios-deploy's debug timeout also kills the app, including while Xcode is
    # loading device symbols. Device discovery already has its own timeout.
    if ! ios-deploy --id "$DEVICE_UDID" --bundle "$built_app" --noinstall --nostart \
      --custom-command run --custom-command 'script import time; time.sleep(2)' \
      --custom-command 'script error = lldb.debugger.GetSelectedTarget().GetProcess().Detach(); print(error, flush=True); import os; os._exit(0 if error.Success() else 1)' "${device_env[@]}"; then
      echo "Launch did not complete. Unlock the iPhone and open RouteVN Creator, or retry bun run ios:launch." >&2
      echo "Any saved dev-server setting is already on the phone; no rebuild is needed." >&2
      return 1
    fi
    return
  fi
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

  if [ -n "${ROUTEVN_UPDATE_API_URL:-}" ]; then
    launch_env+=(SIMCTL_CHILD_ROUTEVN_UPDATE_API_URL="$ROUTEVN_UPDATE_API_URL")
  fi

  env "${launch_env[@]}" xcrun simctl launch --terminate-running-process "$udid" "$BUNDLE_ID"
}

clean_app() {
  rm -rf "${IOS_DIR}/build"
  xcodebuild -project "${IOS_DIR}/routevn.xcodeproj" -scheme "$SCHEME" clean
}

shift_command_args "$@"
cd "$PROJECT_DIR"

if [ "$TARGET" = device ]; then
  case "$COMMAND" in
    run|install|launch|dev|packaged)
      DEVICE_UDID=$(find_device_udid)
      ;;
  esac
fi

if [ "$COMMAND" = dev ]; then
  if [ -z "$IOS_DEV_SERVER_URL" ]; then
    IOS_DEV_SERVER_URL=$(node scripts/ios-dev.js url)
  fi
  echo "Using iOS dev server: $IOS_DEV_SERVER_URL"
elif [ "$COMMAND" = packaged ]; then
  IOS_DEV_SERVER_URL=""
fi

if [ "$TARGET" = device ]; then
  case "$COMMAND" in
    dev|packaged)
      save_device_dev_configuration
      ;;
    run|launch)
      # For run, save after installation (a fresh install has no app container).
      if [ "$COMMAND" = launch ] && [ -n "$IOS_DEV_SERVER_URL" ]; then save_device_dev_configuration; fi
      ;;
  esac
fi

case "$COMMAND" in
  build)
    build_app
    ;;
  run)
    build_app
    install_app
    if [ "$TARGET" = device ] && [ -n "$IOS_DEV_SERVER_URL" ]; then save_device_dev_configuration; fi
    launch_app
    ;;
  install)
    install_app
    ;;
  launch|dev|packaged)
    launch_app
    ;;
  devices)
    if [ "$TARGET" = device ]; then
      ios-deploy --detect --no-wifi --timeout 3
    else
      xcrun simctl list devices available
    fi
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
