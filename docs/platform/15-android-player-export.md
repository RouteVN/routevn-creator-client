# 15 Android Player Export

Date baseline: November 7, 2026.

Status: implemented. Template build, export, and APK validation with the
Android build tools (`zipalign -c -P 16 4`, `apksigner sign` and
`apksigner verify --min-sdk-version 24`, `aapt2 dump badging`) pass locally.
Installing and running an exported, signed APK on a physical device or an
emulator is still required before release, as is a build of the iOS Creator
host on macOS.

## Product Contract

RouteVN Creator exports one unsigned APK:

```text
<game-name>-<version>-unsigned.apk
```

Export runs on the desktop (Windows, macOS, Linux), Android, and iOS Creator
hosts. Web does not export APKs. No host runs Gradle, the Android SDK, or a
network service: export rewrites a prebuilt player template.

The APK is not signed. Android refuses to install an unsigned APK, so the
creator signs it with their own key before installing or distributing it:

- sign with APK Signature Scheme v2 or later (`apksigner` signs v2 and v3 by
  default; the player's minimum SDK is 24, so v1 is not required)
- use the same key for every release of the same game, or Android treats the
  update as a different publisher and refuses it
- do not run `zipalign` after signing; the APK is already aligned and
  realigning it invalidates the signature

The APK contains `arm64-v8a`, `armeabi-v7a`, `x86`, and `x86_64` native code,
has minimum SDK 24 and target SDK 37, requests no permissions, and declares one
launcher activity.

## Bundled Template

Creator ships these committed resources:

```text
player-templates/android/RouteVNPlayerTemplate.apk
player-templates/android/RouteVNPlayerTemplate.json
```

`bun run player-template:build:android` stages the standalone player
(`main.js`, its assets, the Android persistence host, and
`scripts/player-templates/android/index.html`), builds the
`routevn-player-jni` library for the four ABIs, assembles `android/player` in
release mode without signing, and runs
`routevn-android-template describe` from `crates/routevn-android-export`.
The descriptor command refuses the template unless:

- the APK has no signature files and no APK Signing Block
- the package is `vn.routevn.androidplayer.template`, minimum SDK 24, target
  SDK 37, and the application is not debuggable
- the application label is a literal string and there is exactly one activity
- no provider, service, or receiver is declared, and no permission other than
  ones derived from the application ID is declared or requested
- no `classes*.dex` file contains the template application ID, so Java code
  never depends on the ID the exporter replaces
- `resources.arsc` is stored, and the reserved colors `#FF13579B` (icon
  background) and `#FF2468AC` (splash background) occur in `color` resources
- `mipmap/ic_launcher`, `mipmap/ic_launcher_foreground`, and
  `drawable/splash_icon` exist as PNG files for five densities with the
  expected pixel sizes
- stored entries are 4-byte aligned and native libraries are stored and
  16 KiB aligned

The descriptor records the template version, ABIs, the exact `resources.arsc`
offsets of each reserved color, every icon file with its kind and size, and the
template's SHA-256. Export refuses a template whose hash differs.

The player's Java classes live in `vn.routevn.androidplayer`, outside the
template application ID, so changing the application ID never requires
changing code.

## Export Transaction

`crates/routevn-android-export` runs the same steps on every host:

1. validate the request: application ID (Android package-name rules, reserved
   IDs rejected), application name, three-part numeric version, build number
   from 1 to 2100000000, and opaque `#RRGGBB` colors
2. check the descriptor and template hash, and decode the icon
3. stream the game package to a work folder, then encrypt it in 1 MiB
   XChaCha20-Poly1305 segments as a standalone chunked payload
4. rewrite the binary manifest: replace the template application ID and the
   values derived from it, set `versionCode`, `versionName`, the application
   label, and `screenOrientation` (`sensorPortrait` when the release's screen
   height exceeds its width, `sensorLandscape` otherwise)
5. patch the two reserved colors in `resources.arsc` in place
6. render the icon for each image slot: legacy icons fill their square,
   adaptive foregrounds fit the centered 72 dp of 108 dp, and splash icons fit
   inside the centered 192 dp circle of 288 dp
7. write a new ZIP next to the destination: template entries in their original
   order with signature files dropped, unchanged entries copied without
   recompression, changed entries stored, and the encrypted package stored last
   as `assets/routevn-package.bin`; stored data is 4-byte aligned, native
   libraries 16 KiB aligned, timestamps are fixed, and ZIP64 is refused
8. reopen the APK and verify alignment, the manifest values, the colors, that
   no signing data or template ID remains, and that the package decrypts to
   the expected length
9. rename the finished file onto the destination

Memory stays bounded by the largest asset and the icon images, so mobile hosts
use the same code. Progress phases are `prepareApk`, the package phases shared
with other exports, `encryptPayload`, `rewriteManifest`, `renderIcons`,
`writeApk`, `verifyApk`, and `finalizeApk`. Mobile hosts add `saveApk` while
they copy the APK to the chosen destination.

## Player Runtime

The player is one activity with a WebView. Web content is served from
`https://appassets.androidplatform.net/web/` by `WebViewAssetLoader`. Requests
for `/web/package.bin` are answered from `assets/routevn-package.bin`: Java
opens the APK at the asset's offset and length, and the `routevn_player` JNI
library decrypts the requested range. Responses follow the desktop package
shim: a single `bytes=` range returns 206 with `Content-Range`, a missing or
unsatisfiable range returns 416.

`addWebMessageListener` exposes `RouteVNPlayerAndroid` to the asset origin
only. The persistence host speaks the same `init`, `list`, `set`,
`applyBatch`, and `clear` contract as the Windows and macOS players (see
`11-windows-player-runtime-persistence.md` and
`12-windows-player-runtime-key-value-contract.md`), stored in the app's
`runtime.db` with WAL, `synchronous=FULL`, and schema version 1.

One difference: Android's bundled SQLite has no `json_valid()` before API 34,
so the `kv.value` column has no CHECK constraint on Android. The native store
validates every value with a strict JSON syntax check before writing, in
addition to the JavaScript validation every player performs.

Auto Backup and device transfer include only `runtime.db` and its WAL file.

The splash screen uses the AndroidX SplashScreen library with the patched
splash background color and splash icon. It stays up until the player calls
`__ROUTEVN_PLAYER_HOST__.onReady()` after its first frame, or for at most
10 seconds; after that the player's own loading and error views are visible.
The activity hides the system bars, keeps the WebView across configuration
changes, opens external `http` and `https` links in the browser, and moves the
task to the back on Back instead of finishing.

## Creator Hosts

The shared project export facade exposes `getAndroidExportAvailability`,
`promptAndroidApkPath`, and `createAndroidApkToPath`. Availability is true only
when the host has the template and the exporter accepts its descriptor.

- Desktop: the Tauri commands `get_android_export_host_capabilities` and
  `export_android_apk` run the exporter on a blocking task and forward
  throttled progress through a Tauri channel.
- Android: the Creator bundles the template in its assets, copies it to
  no-backup storage once per template version, and runs the exporter through
  `NativeExporter.exportAndroidApk` on a dedicated thread. The APK is written
  to the cache folder and then copied to the Storage Access Framework
  destination and size-checked.
- iOS: the Creator links the `routevn-exporter-ffi` static library, bundles
  the template as an app resource, and copies the finished APK to the chosen
  save destination.

Mobile hosts implement the bridge methods `getAndroidExportAvailability` and
`exportAndroidApkToUri` and report progress through
`window.__routeVNApkExportProgress({ exportId, phase, current, total,
elapsedMs })`.

## Canonical Implementation Areas

- template project: `android/player/`
- template build: `scripts/build-android-player-template.js`,
  `scripts/build-android-player-rust.sh`
- player package reader: `crates/routevn-player-jni/`
- exporter: `crates/routevn-android-export/`
- shared payload: `crates/routevn-packager/src/payload.rs`
- desktop command: `src-tauri/src/export_android.rs`
- Android Creator host: `crates/routevn-exporter-jni/`,
  `android/routevn/app/src/main/java/com/routevn/creator/`
- iOS Creator host: `crates/routevn-exporter-ffi/`, `ios/routevn/routevn/`
- persistence host: `src/deps/clients/android/`
- mobile adapter: `src/deps/services/shared/mobileAndroidApkExport.js`
- shared export facade: `src/deps/services/shared/projectExportService.js`
- Versions workflow: `src/pages/versions/`

## Release Gate

Before release, sign an exported APK with `apksigner` and install it on a
physical device and on API 24 and current-API emulators. Check launch, the
splash screen and icon on each launcher shape, portrait and landscape games,
audio, saving and reloading, Back, a reinstall of a higher Build Number signed
with the same key, and an export from the Android and iOS Creator apps.
