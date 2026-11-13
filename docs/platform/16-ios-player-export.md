# 16 iOS Player Export

Date baseline: November 13, 2026.

Status: implemented and switched off. `IOS_EXPORT_RELEASED` in
`src/internal/iosExport.js` switches it on: when it is false, the Versions
page hides the iOS export button and Platform Details hides the iOS platform.
The remaining checks are listed under [Release Gate](#release-gate).

## Product Contract

RouteVN Creator on macOS exports an IPA signed by Xcode:

```text
<game-name>-<version>.ipa
```

Export needs a Mac with Xcode 26 or later, set up (its first launch finished
and its license accepted), with the iOS platform installed, and signed in to
an Apple Account (Xcode > Settings > Accounts). Creator does not sign the app
itself and never sees the creator's certificates or passwords: it assembles an
unsigned Xcode archive and has Xcode export it with automatic signing, so
Xcode creates or downloads the certificate and provisioning profile it needs
and registers the bundle identifier with the team when it is new.

The export dialog asks for:

- Version (`CFBundleShortVersionString`, three numbers of up to nine digits)
  and Build Number (`CFBundleVersion`, 1 to 999999999). They are not saved.
- Apple Team: one of the teams Xcode is signed in to. The dialog selects the
  team the game last exported with (`platformDetails.ios.teamId`), else the
  first paid team.
- Build For:
  - App Store: signed for distribution (TestFlight and the App Store). A
    Personal Team cannot make these builds. Optionally uploads the build to
    App Store Connect after saving the IPA; the app must already exist in App
    Store Connect with the same bundle identifier.
  - Development: signed with a development profile; it runs only on devices
    registered with the team. Install On picks a connected iPhone or iPad:
    the build is installed there and opened, and no IPA is saved, so Creator
    does not ask for a location. With Don't install, the IPA is saved.

App Store builds are always saved first. A creator who does not upload from
Creator can upload the saved IPA with Apple's Transporter app.

The app supports iPhone and iPad, iOS 16.0 or later, arm64 only, runs full
screen with the status bar and home indicator hidden, and locks to landscape
or portrait from the release's screen size (portrait when the height exceeds
the width; iPad also allows upside-down portrait). It requests no
permissions.

The template does not set `ITSAppUsesNonExemptEncryption`, so App Store
Connect asks the export compliance question for each uploaded build.

## Platform Details

`platformDetails.ios` holds the application name (the Home Screen name), the
icon, the bundle identifier, and `teamId` (see `07-persisted-key-catalog.md`).
The bundle identifier uses reverse-domain segments of letters, digits, and
hyphens, at most 155 characters. The icon crop produces 1024 by 1024 pixels,
the App Store icon size.

## Bundled Template

Creator ships `player-templates/ios/RouteVNPlayerTemplate.app.zip`, an
unsigned release build of `ios/player`. Build it on a Mac with Xcode:

```bash
bun run player-template:build:ios
```

The script stages the standalone player (`main.js`, its assets, the iOS
persistence host, and `scripts/player-templates/ios/index.html`) into
`ios/player/RouteVNPlayer/web`, builds `crates/routevn-player-ffi` as a
static library for `aarch64-apple-ios` (and `aarch64-apple-ios-sim`, so the
Xcode project also runs in the simulator), builds the app with `xcodebuild`
without code signing, and refuses the result unless:

- `RouteVNPlayer`, `Info.plist`, and `Assets.car` are present and there is no
  `_CodeSignature`
- the executable is arm64 only
- after `strip -S -x`, the executable contains neither the checkout path nor
  the home folder (Rust source paths are remapped while building)

`player-template:prepare:ios` only stages the web files, for running the
Xcode project directly.

## Export Transaction

`src-tauri/src/export_ios.rs`, `export_ios_application`:

1. validate the request: application name, bundle identifier, version, build
   number, team ID (10 uppercase letters or digits), `.ipa` output path, and
   upload only with App Store builds
2. find Xcode (below) and check that it is ready
3. expand the template with `ditto` and check that it is an unsigned player
4. write the game package and encrypt it as a standalone chunked
   XChaCha20-Poly1305 payload at `RouteVNPlayer.app/routevn-package.bin`
5. stamp `Info.plist`: bundle identifier, display name, version, build
   number, and the iPhone and iPad orientations
6. render the icon: crop to the centered square, scale to 1024 pixels, and
   draw transparent pixels over white (the App Store refuses icons with
   alpha); compile it and the black launch background with `actool`, and
   merge the icon keys `actool` reports into `Info.plist`
7. write the archive: `RouteVNPlayer.xcarchive/Products/Applications/` holds
   the app, and its `Info.plist` names the app path, bundle identifier,
   versions, team, and creation date (whole seconds; Xcode calls an archive
   with fractional seconds malformed)
8. run `xcodebuild -exportArchive -allowProvisioningUpdates` with
   `method` `app-store-connect` or `debugging`, `signingStyle` `automatic`,
   the team, and for App Store builds `destination` `export`,
   `uploadSymbols` false, and `manageAppVersionAndBuildNumber` false
9. save the IPA: copy it next to the destination and rename it into place;
   for a device install, install it from the workspace instead, then open
   the app (see below). The workspace is deleted when the export ends.
10. for an upload, run the export again with `destination` `upload`

Progress phases are `prepareApplication`, the package phases shared with
other exports, `encryptPayload`, `compileAssets`, `signApplication`,
`saveApplication` or `installApplication`, and `uploadApplication`. The
Versions dialog groups them into the steps Prepare project, Pack game files,
Build app, Sign with Xcode, then Save IPA or Install on device, and Upload to
App Store Connect (`src/pages/versions/support/iosExportSteps.js`).

Failures reject with `{ code, message, ipaSaved }`, where `message` holds
Xcode's error lines and `ipaSaved` is true when only the upload failed.
Codes are `invalid-request`, `xcode-unavailable`, `template-invalid`,
`team-not-signed-in`, `team-cannot-distribute`, `signing-failed`,
`app-record-missing`, `agreement-required`, `build-number-used`,
`version-closed`, `upload-failed`, `device-not-registered`,
`device-unavailable`, `install-failed`, and `export-failed`.
Codes are matched from Xcode's output, so an unrecognized message falls back
to `signing-failed` or `upload-failed`.

## Xcode, Teams, and Devices

`get_ios_export_requirements` returns the Xcode status and the signed-in
teams. Xcode is looked for at the folder `xcode-select -p` names, then
`/Applications/Xcode.app`, then any Xcode Spotlight finds; the Command Line
Tools alone do not count. Every Xcode command runs with `DEVELOPER_DIR` set
to the chosen Xcode. The status is `ready`, `notInstalled`, `outdated`,
`needsSetup` (`xcodebuild -checkFirstLaunchStatus` fails or no version is
reported), `iosPlatformMissing` (no iOS SDK or `actool`), or
`unsupportedHost` on Windows and Linux. The Versions page explains each one;
for a missing or outdated Xcode it offers to open Xcode's Mac App Store page.

Teams come from Xcode's preferences (`IDEProvisioningTeamByIdentifier` in
`com.apple.dt.Xcode`): team ID, name, kind, and whether it is a free Personal
Team. The key is not documented; a missing or changed key gives no teams,
and the Versions page then asks the creator to sign in to Xcode.

`list_ios_devices` reads `devicectl list devices` and keeps physical iPhones
and iPads that are paired and reachable. A device install runs
`devicectl device install app` and opens the app with
`devicectl device process launch`; opening fails while the device is locked,
which the result reports as `launched: false`.

## Player Runtime

The player is a Swift app with one `WKWebView`. Web content is served from
`routevn-player://game/web/` by a URL scheme handler that reads the app
bundle's `web` folder. Requests for `/web/package.bin` are answered from
`routevn-package.bin` through the `routevn_player` static library, which
decrypts the requested range. Responses follow the desktop package shim: a
single `bytes=` range returns 206 with `Content-Range`, and a missing or
unsatisfiable range returns 416. Other origins get 403 and other methods 405.

The `RouteVNPlayerIOS` bridge accepts messages only from the main frame of
the player origin. The persistence host speaks the same `init`, `list`,
`set`, `applyBatch`, and `clear` contract as the other players (see
`11-windows-player-runtime-persistence.md` and
`12-windows-player-runtime-key-value-contract.md`), stored in
`Application Support/runtime.db` with WAL, `synchronous=FULL`, schema
version 1, and the same `json_valid` CHECK and null-delete triggers as the
desktop players. The JavaScript side shares
`src/deps/clients/shared/mobilePlayerRuntimeDb.js` with Android.

Audio and media are suspended while the app is inactive. If iOS stops the
web content process, the page reloads. External `http` and `https` links open
in Safari.

## Creator Hosts

Only the macOS desktop app exports for iOS. The shared project export facade
exposes `getIosExportAvailability` (a Mac with the bundled template),
`getIosExportRequirements`, `listIosDevices`, `promptIosApplicationPath`,
and `exportIosApplication`. The Tauri commands run on blocking tasks; the
export forwards throttled progress through a Tauri channel. Windows and Linux builds include the commands, which
report `unsupported-host`.

## Testing an Export Without the UI

An ignored Rust test exports a game folder that holds `instructions.json` and
`assets.json` (the export input the Versions page builds):

```bash
cd src-tauri
ROUTEVN_IOS_EXPORT_TEST=<input folder> \
ROUTEVN_IOS_TEMPLATE=$PWD/assets/player-templates/ios/RouteVNPlayerTemplate.app.zip \
ROUTEVN_IOS_OUTPUT=/tmp/Game.ipa ROUTEVN_IOS_NAME="Project One" \
ROUTEVN_IOS_BUNDLE_ID=com.example.project-one ROUTEVN_IOS_ICON=<png> \
ROUTEVN_IOS_TEAM=<team id> \
cargo test --lib export_ios::tests::exports_a_game -- --ignored --nocapture
```

It makes a development build; `ROUTEVN_IOS_APP_STORE=1` makes an App Store
build, `ROUTEVN_IOS_UPLOAD=1` also uploads it, and `ROUTEVN_IOS_BUILD` sets
the build number. To install a development build on a device instead of
saving it, leave out `ROUTEVN_IOS_OUTPUT` and set `ROUTEVN_IOS_DEVICE` to the
device's identifier from `xcrun devicectl list devices`.

## Canonical Implementation Areas

- template project: `ios/player/`
- template build: `scripts/build-ios-player-template.js`
- player package reader: `crates/routevn-player-ffi/`
- shared payload: `crates/routevn-packager/src/payload.rs`
- exporter and commands: `src-tauri/src/export_ios.rs`
- persistence host: `src/deps/clients/ios/playerRuntimeHost.js`,
  `src/deps/clients/shared/mobilePlayerRuntimeDb.js`
- helpers: `src/internal/iosExport.js`
- shared export facade: `src/deps/services/shared/projectExportService.js`
- Tauri adapter: `src/deps/services/tauri/projectServiceAdapters.js`
- Versions workflow: `src/pages/versions/`

## Release Gate

Before switching the export on, check on a physical iPhone and iPad: a
development build installed from Creator, an App Store build uploaded from
Creator and installed through TestFlight, a portrait game, audio, saving and
reloading, the app in the background and after the system ends it, and an
update over a lower Build Number keeping saves. Check an export with an
Xcode that has never exported before, and the messages for a missing Xcode
and for no signed-in account.
