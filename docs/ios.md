# iOS Development

RouteVN Creator's iOS app is a native `WKWebView` shell around the web build.
It does not use Tauri mobile, Fastlane, CocoaPods, or the Xcode GUI workflow.

The iOS app lives in `ios/routevn` and loads the iOS frontend bundle built from
`src/setup.ios.js`.

## Current Scope

This is a simple-tools first pass.

Included:

- command-line `xcodebuild` and Simulator workflow
- packaged web assets through a custom `routevn://app/...` URL scheme
- optional debug web assets from `http://127.0.0.1:3001/ios/index.html`
- native bridge for local SQLite, project files, document picking, downloads,
  and local project import/export
- native streamed distribution ZIP export for file URL save targets
- app-private project storage under iOS Application Support
- user-visible downloads and exports under the app's Documents folder

Not included yet:

- Fastlane
- App Store/TestFlight export automation
- production signing profiles
- remote collaboration

## Local Setup

Install:

- Xcode command line tools, or Xcode with command-line tools selected.
- Bun dependencies for this repo.

Useful checks:

```bash
xcodebuild -version
xcrun simctl list devices available
```

## Project Layout

- `src/setup.ios.js`: iOS runtime entrypoint.
- `src/deps/clients/ios/`: low-level iOS client adapters.
- `src/deps/services/ios/`: iOS service adapter composition.
- `static/ios/index.html`: iOS asset HTML template.
- `scripts/build-ios-assets.js`: copies `_site` output into iOS resources.
- `scripts/watch-ios.sh`: prepares and watches the iOS frontend bundle.
- `scripts/ios.sh`: command-line build/install/launch helper.
- `ios/routevn`: native iOS project.

Packaged builds load local assets through:

```text
routevn://app/ios/index.html
```

Internal project and picker files are served through:

```text
routevn://app/ios-files/...
```

## Build And Run

Build iOS web assets:

```bash
bun run build:ios
```

Build the native app for Simulator:

```bash
bun run ios:build
```

Build, install, and launch on the default Simulator:

```bash
bun run ios:run
```

By default, the Debug shell loads the packaged assets in the app bundle. To
launch against a live iOS dev server instead, pass `--dev-server`.

Choose a Simulator:

```bash
bun run ios:run -- --simulator "iPhone 17"
```

List available Simulators:

```bash
bun run ios:devices
```

Run the built-in simulator smoke test:

```bash
bun run ios:run -- --smoke-test
```

## Watch Mode

Watch mode uses the local dev server:

```text
http://127.0.0.1:3001/ios/index.html
```

Run the iOS frontend watch server:

```bash
bun run watch:ios
```

Then launch the native shell against it:

```bash
bun run ios:run -- --dev-server "http://127.0.0.1:3001/ios/index.html"
```

After that, JS, YAML view, store, handler, i18n, and setup changes are served
from the dev server. Refresh or relaunch the app without rebuilding the native
shell.

Physical iOS devices cannot use the Mac host's `127.0.0.1` address. Device
debugging will need a host-reachable dev-server URL before watch mode is useful
on hardware.

## Native Adapters

iOS uses native adapters instead of Tauri mobile APIs.

- Router: `src/deps/clients/ios/router.js`
- SQLite: `src/deps/clients/ios/sqlite.js`
- File picker: `src/deps/clients/ios/filePicker.js`
- Project services: `src/deps/services/ios/`

The native bridge in `RouteVNApp.swift` handles:

- route back-state updates
- external URL opening
- SQLite open/query/exec/close
- project file read/write/metadata
- download writes
- streamed distribution ZIP export
- iOS document picker results
- local project folder import/export

## Simulator Validation

Simulator validation is the active mobile gate until physical-device testing is
available.

Current simulator-safe checks:

- `bun run ios:run -- --smoke-test`
- ZIP integrity check on the smoke-test export
- iOS adapter tests under `tests/ios/`
- shared mobile viewport/unit tests under `tests/`

The adapter tests cover:

- iOS router stack persistence
- file picker fallback and native-result cleanup
- save picker and selected-file writes
- opaque folder-picker URI forwarding
- native streamed ZIP export delegation
- JavaScript ZIP fallback writes to the selected URI
- disabled remote collaboration behavior

## Current Device Test Needs

Simulator is enough for initial shell, SQLite, and packaged asset validation.
A physical iPhone or iPad is needed before trusting:

- Files app document provider behavior
- security-scoped folder import/export across providers such as iCloud Drive
- camera/photo/document picker edge cases
- real touch keyboard and safe-area behavior
- any release signing or install-on-device flow
