# 15 Android Player Export

Date baseline: November 7, 2026.

Status: implemented and switched on. Template build, export, and APK
validation with the Android build tools (`zipalign -c -P 16 4`,
`apksigner sign` and `apksigner verify --min-sdk-version 24`,
`aapt2 dump badging`) pass locally, and Creator-signed APKs install and run on
a physical Android 16 tablet. The remaining checks are listed under
[Release Gate](#release-gate).

`ANDROID_EXPORT_RELEASED` in `src/internal/androidExport.js` switches the
export off again: when it is false, the Versions page hides the Android export
button and Platform Details hides the Android platform.

## Product Contract

RouteVN Creator exports an APK, signed or unsigned:

```text
<game-name>-<version>.apk           (signed)
<game-name>-<version>-unsigned.apk  (unsigned)
```

Export runs on the desktop (Windows, macOS, Linux), Android, and iOS Creator
hosts. Web does not export APKs. No host runs Gradle, the Android SDK,
`apksigner`, a JDK, or a network service: export rewrites a prebuilt player
template, and the exporter signs the APK itself. Desktop hosts sign; the
Android and iOS Creator apps export unsigned APKs.

A signed APK installs directly. An unsigned APK is for creators who sign with
their own tools:

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
6. render images on centered transparent canvases, preserving aspect ratio:
   the app icon fills the legacy square. The adaptive foreground, or the app
   icon when there is none, fits the centered 72 dp square of its 108 dp
   canvas, so it fills the launcher shape and the mask trims its corners. An
   optional splash icon fits the centered 192 dp square of its 288 dp canvas;
   otherwise the app icon fits the largest square inside the centered 192 dp
   circle.
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

The Versions export dialog groups the phases into steps: Create signing key
(only when the export makes the key), Prepare project, Pack game files, Build
APK, Sign APK (signed exports only), and Save APK. Each step shows as done,
running, or not started, and the running step shows its phase's count or size,
such as `12 / 423`. The mapping is in
`src/pages/versions/support/androidApkExportSteps.js`.

## Player Runtime

The player is one activity with a WebView. Web content is served from
`https://appassets.androidplatform.net/web/` by `WebViewAssetLoader`. Requests
for `/web/package.bin` are answered from `assets/routevn-package.bin`: Java
opens the APK at the asset's offset and length, and the `routevn_player` JNI
library decrypts the requested range. Responses follow the desktop package
shim: a single `bytes=` range returns 206 with `Content-Range`, a missing or
unsatisfiable range returns 416. WebView applies an explicit range start to the
returned stream itself, so that stream begins at offset 0 and skips to the
start without decrypting the skipped bytes. A suffix range is not skipped by
WebView, so its stream begins at the computed start.

`addWebMessageListener` exposes `RouteVNPlayerAndroid` to the asset origin
only. The persistence host speaks the same `init`, `list`, `set`,
`applyBatch`, and `clear` contract as the Windows and macOS players (see
`11-windows-player-runtime-persistence.md` and
`12-windows-player-runtime-key-value-contract.md`), stored in the app's
`runtime.db` with WAL, `synchronous=FULL`, and schema version 1. Values are
read in chunks so saves are not limited by the Android cursor window size.

One difference: Android's bundled SQLite has no `json_valid()` before API 34,
so the `kv.value` column has no CHECK constraint on Android. The native store
validates every value with a strict JSON syntax check before writing, in
addition to the JavaScript validation every player performs.

Audio is suspended while the game is in the background and resumes when it
returns to the foreground. Android System WebView 111 or later is required; an
older version shows a message asking the player to update it.

Auto Backup and device transfer include only `runtime.db` and its WAL file.

The splash screen uses the AndroidX SplashScreen library with the patched
splash background color and splash icon. It stays up until the player calls
`__ROUTEVN_PLAYER_HOST__.onReady()` after its first frame, or for at most
10 seconds; after that the player's own loading and error views are visible.
The activity hides the system bars, keeps the WebView across configuration
changes, opens external `http` and `https` links in the browser, and moves the
task to the back on Back instead of finishing.

## Signing

Each project has one current signing key, saved in the project's
`androidSigning` key (see `07-persisted-key-catalog.md`) with every key it
replaced. The export dialog asks only Signed or Unsigned. The first signed
export of a game makes its key, after the save location is chosen and while
the progress dialog shows; the dialog closes before the key is made, and key
changes run one at a time, so repeated clicks make one key. Later signed
exports reuse it. A new key is saved in the project before the APK is signed;
if saving fails, the export stops with an error. Android accepts an update
only when it is signed with the same key, so the dialog and Platform Details
say that the key is in the project, that the project needs a backup, and that
the project folder must not be shared publicly.

The key is not protected by a password: for creators who are not technical, a
forgotten password is a likelier way to lose the key than a leak. Copying or
backing up the project copies the key, and the keys never leave the project
database except through Save a Copy. They are in the project's local `app`
store, not in the shared project state, so collaborators do not receive them.
The certificate names only the game.

The Android tab of Platform Details has a Signing Key section on hosts that
sign:

- the current key's SHA-256 fingerprint, whether Creator made it or it was
  uploaded, and when
- **Create Key**, when the game has none, and **Replace Key**, which warns
  that phones with builds signed with the current key cannot update to the new
  one; the replaced key stays as a previous key
- **Upload Key**: choose a keystore, then enter its password and, when it
  holds several keys, an alias; a wrong password or alias asks again
- **Save a Copy**: a PKCS #12 keystore of the key with a password of at least
  6 characters and the alias `key0`
- previous keys, each with **Use Again**, which warns like Replace Key, and
  Save a Copy
- changing the application identifier of a game with a key warns that
  installed copies will not update to builds with the new identifier

Keys:

- Create Key: RSA 2048 with SHA-256 and a self-signed certificate valid for
  30 years, whose subject is `CN=<application name>` (the application ID when
  the name is empty or `Android Debug`)
- Upload Key: a PKCS #12 keystore (`.p12`, `.pfx`, or a `.keystore` or `.jks`
  file written by JDK 9 or later), with its password and, when it holds
  several keys, an alias; both the older (3DES with an HMAC-SHA1 MAC) and the
  current (PBES2 AES-256 with an HMAC-SHA256 MAC) encryption are read; legacy
  JKS and JCEKS files, non-RSA keys, and keys under 2048 bits are refused with
  their own error codes
- Save a Copy writes the current encryption, which `keytool` reads, through a
  temporary file renamed into place; on Unix the file is readable only by the
  user

The host makes, reads, and writes keys and signs; it keeps no keys. A stored
key is checked against its fingerprint before it signs.

Signing runs after the unsigned APK is verified (step 8 above): the exporter
digests the entries, central directory, and end record in 1 MiB chunks,
streaming from disk, signs with APK Signature Scheme v2 (RSASSA-PKCS1-v1_5
over SHA-256), and inserts the APK Signing Block before the central directory
in place, so entry data and alignment do not move. It then rereads the file,
checks the signature and the content digest, and checks that the certificate
is the chosen key's, before the rename. The extra progress phases are
`signApk` and `verifySignature`.

## Creator Hosts

The shared project export facade exposes `getAndroidExportAvailability`,
`promptAndroidApkPath`, and `createAndroidApkToPath`. The project service
also exposes the signing key operations, and `supportsAndroidSigning` reports
whether the host signs. Availability is true only when the host has the
template and the exporter accepts its descriptor.

- Desktop: the Tauri commands `get_android_export_host_capabilities` and
  `export_android_apk` run the exporter on a blocking task and forward
  throttled progress through a Tauri channel. `export_android_apk` takes an
  optional `signingKey`. The signing commands `create_android_signing_key`,
  `read_android_keystore`, and `write_android_keystore` pass keys as
  `{ certificateSha256, certificate, privateKey }` and reject with
  `{ code, message }`.
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
- exporter: `crates/routevn-android-export/` (signing in `signing.rs`)
- shared payload: `crates/routevn-packager/src/payload.rs`
- desktop command: `src-tauri/src/export_android.rs`
- Android Creator host: `crates/routevn-exporter-jni/`,
  `android/routevn/app/src/main/java/com/routevn/creator/`
- iOS Creator host: `crates/routevn-exporter-ffi/`, `ios/routevn/routevn/`
- persistence host: `src/deps/clients/android/`
- mobile adapter: `src/deps/services/shared/mobileAndroidApkExport.js`
- shared export facade: `src/deps/services/shared/projectExportService.js`
- Versions workflow: `src/pages/versions/`
- signing keys: `src/deps/services/shared/androidSigningService.js`, the
  `androidSigning` helpers in `src/internal/androidExport.js`, and the
  Platform Details key actions in `src/pages/platformDetails/`

## Release Gate

Before release, install a Creator-signed APK, and an unsigned one signed with
`apksigner`, on a physical device and on API 24 and current-API emulators.
Check launch, the splash screen and icon on each launcher shape, portrait and
landscape games, audio, saving and reloading, Back, a reinstall of a higher
Build Number signed with the same key, and an export from the Android and iOS
Creator apps.
