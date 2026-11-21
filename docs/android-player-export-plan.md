# Android Player Export Plan

Status: implemented, with every open decision below taken as recommended.
The current contract is `docs/platform/15-android-player-export.md`; this plan
records the design reasoning. Device installation and the iOS Creator build on
macOS remain to be verified.

Date baseline: November 7, 2026.

## Goal

Add an Android export to the Versions flow that produces an **unsigned APK**
from a prebuilt player template, following the Windows and macOS template
model. Exporting a game must not run Gradle, the Android SDK, a JDK, or the NDK
on the creator's machine.

Signing is out of scope for this phase. The creator signs the exported APK with
a tool and key of their choice. A RouteVN-provided signing option may follow in
a separate plan; the output defined here stays compatible with it.

## Product Contract

- output: `<game-name>-<version>-unsigned.apk`
- one APK containing every supported ABI: `arm64-v8a`, `armeabi-v7a`, `x86`,
  `x86_64`
- `minSdk` 24, matching the Creator Android app
- `targetSdk` is fixed by the template build, currently 37
- the APK is fully aligned and carries no signature
- the APK cannot be installed until it is signed
- supported export hosts: Creator desktop on Windows, macOS, and Linux, the
  Creator Android app, and the Creator iOS app
- not supported: the web Creator; the action is hidden there

The export does not ask for or require:

- a signing key or keystore
- the Android SDK, build tools, NDK, or Gradle
- a JDK
- Rust, Cargo, Bun, or Node.js
- a Google account or Play Console account

### What The Creator Does After Export

The creator signs the APK before distributing it:

- use a signer that writes APK Signature Scheme v2 or later, such as the
  Android SDK `apksigner`; v1 JAR signing is not required because `minSdk` is
  24
- sign every release of one game with the same key; Android rejects an update
  signed with a different key
- do not run `zipalign` after signing; the exported APK is already aligned and
  aligning after signing invalidates a v2 signature
- where Android requires developer verification for installed apps, register
  the package name and signing certificate under the creator's own developer
  account

Google Play does not accept APKs for new apps. Play distribution needs an
Android App Bundle and is out of scope.

## Why No Server Is Needed

The export host never compiles anything. RouteVN maintainers build the player
template in advance. The export only:

- builds and encrypts the game package with the existing exporters
- edits the template's binary `AndroidManifest.xml`
- replaces launcher and splash icon images
- patches two color values in `resources.arsc` in place
- rewrites the APK ZIP with the required alignment

All of this is portable Rust with no platform tools. Unlike the macOS export,
which needs Apple signing tools and therefore a Mac host, Android export can run
on every native Creator host: desktop, Android, and iOS. One shared Rust crate
does the work; each host only adds a thin binding and its own save-destination
handling.

## Player Template

### Template App

Add a minimal Gradle project at `android/player/`, separate from
`android/routevn/` so the Creator's dependencies (crash reporting, update
checks, pickers, editor bridge) never ship inside games.

- Java, one activity; library dependencies limited to `androidx.webkit` and
  `androidx.core:core-splashscreen`, the same splash library the Creator app
  uses
- Java namespace `vn.routevn.androidplayer`
- reserved template application ID `vn.routevn.androidplayer.template`; the
  exporter replaces it and rejects it as a user value
- the Java namespace must not equal or start with the template application ID,
  so rewriting application-ID strings never touches class names
- no content providers, services, receivers, or permissions of its own; the
  player loads only packaged content
- components or permissions that AndroidX dependencies merge in (for example
  an application-ID-derived `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`) must be
  on an explicit allowlist; any that carry the application ID are rewritten by
  the exporter, because two installed apps cannot declare the same permission
  or provider authority
- `android:label` is a literal string in the manifest, not an `@string`
  reference, so changing the name never restructures `resources.arsc`
- `android:icon="@mipmap/ic_launcher"` with legacy PNGs for mdpi through
  xxxhdpi and an API 26 adaptive icon made from the `player_icon_background` color
  and a PNG foreground; no `roundIcon` and no monochrome layer in the first
  release
- two color resources, `player_icon_background` and `player_splash_background`,
  each with a distinct reserved template value so the exporter can find and
  verify them before patching
- release build, not debuggable, R8 enabled, built without a signing
  configuration so Gradle emits `app-release-unsigned.apk`
- native libraries stored uncompressed and 16 KiB aligned (`extractNativeLibs`
  false, the AGP default); NDK r28 or later aligns ELF segments to 16 KiB by
  default and the repository already pins NDK 29

Activity behavior:

- immersive fullscreen with display cutout handling
- `screenOrientation` set to `sensorLandscape` in the template; the exporter
  switches it to `sensorPortrait` for portrait projects
- handle orientation, screen size, and keyboard configuration changes in place
  so the WebView is not recreated
- pause the WebView, timers, and audio when the app goes to the background
- on Back, move the task to the background instead of finishing, so a game
  in progress is never lost to an accidental Back
- open external links in the system browser, and never navigate the player
  WebView away from its asset origin

### Splash Screen

Android 12 and later always show a system splash screen at launch: an icon
centered on a background color. The template uses `core-splashscreen` so
Android 7 through 11 show the same splash.

- launch theme based on `Theme.SplashScreen`:
  - `windowSplashScreenBackground` is `@color/player_splash_background`
  - `windowSplashScreenAnimatedIcon` is a dedicated `splash_icon` PNG, not the
    launcher icon, so it can be sized for the splash mask
  - `postSplashScreenTheme` is the fullscreen player theme
- the system masks the splash icon to a circle, so the exporter fits the whole
  game icon inside that circle instead of letting the mask crop it
- the activity keeps the splash on screen with `setKeepOnScreenCondition`
  until the player reports over the bridge that its first frame is ready, so
  players never see a blank WebView while `main.js` loads
- a timeout, about 10 seconds, dismisses the splash anyway so the player's
  error diagnostics are visible if startup fails; the Android page keeps the
  web player's loading progress so a slow start after the timeout shows
  progress instead of a blank screen

The splash shows only an icon on a color. Android does not support a
full-screen splash image here; a studio logo or title card belongs in the game
itself, such as an opening scene, which also works on every other platform.

### Web Content

The template serves its web content through `WebViewAssetLoader` at
`https://appassets.androidplatform.net/web/`:

- `index.html`: a new `scripts/player-templates/android/index.html`, sharing
  structure with the Windows and macOS documents, without `windowChrome.js` and
  without the Tauri `package.bin` fetch shim
- `main.js`: the existing standalone player `static/bundle/main.js`; its Tauri
  window calls are already guarded by `__TAURI_INTERNALS__`. It needs one small
  change: call an optional `__ROUTEVN_PLAYER_HOST__.onReady()` hook at the
  point where desktop players show their hidden window, so the Android shell
  knows when to dismiss the splash. Hosts without the hook are unaffected.
- `player-runtime-persistence-host.js`: an Android build of the native
  persistence host, described below

### Package Loading

The exporter writes the game package to `assets/routevn-package.bin` as an
uncompressed (stored) ZIP entry. Stored entries can be opened with
`AssetManager.openFd`, so the player reads byte ranges in place without
extracting a copy.

The package uses the same encrypted, chunked standalone payload as macOS
`routevn-package.bin`: XChaCha20-Poly1305 segments with an empty prefix,
written by `crates/routevn-packager`. Java has no XChaCha20 implementation, so
the template includes a small JNI library built from the existing
`routevn-packager` reader. All native players keep one payload reader.

The player already reads `package.bin` through `createBundleRangeReader`
(`src/deps/services/shared/projectExportService.js`), which sends HTTP `Range`
requests and expects `206`. The Android shell serves that protocol natively:

1. `WebViewClient.shouldInterceptRequest` matches `GET` for
   `/web/package.bin`.
2. It reads the `Range` header from `WebResourceRequest.getRequestHeaders()`.
3. It returns a `206` `WebResourceResponse` with `Content-Range`,
   `Accept-Ranges`, and `Content-Length`, backed by an `InputStream` that pulls
   decrypted bytes from the JNI reader in 1 MiB steps.
4. A missing or invalid range returns `416`, matching the desktop templates.

No JavaScript fetch shim is needed.

Fallback if `Range` headers prove unreliable on supported WebView versions:
reuse the desktop templates' JavaScript fetch shim and serve ranges over the
WebMessage bridge.

### Runtime Persistence

The Android player uses native SQLite with the same schema and key-value
contract as the Windows and macOS players
(`docs/platform/11-windows-player-runtime-persistence.md`,
`docs/platform/12-windows-player-runtime-key-value-contract.md`). It does not
use IndexedDB and has no IndexedDB fallback or migration.

- database: `runtime.db` in the app's private database directory
- identity: Android's per-package app sandbox scopes the database to the
  application ID, which gives the isolation Windows and macOS get from their
  stamped identifiers
- bridge: `addWebMessageListener` restricted to the asset origin and main
  frame, with the JSON request/response shape the Creator's `RouteVNAndroid`
  bridge already uses
- JavaScript: an Android `createDatabase` passed to the existing
  `createPlayerRuntimePersistenceHost`, implementing the five operations the
  host uses: `init`, `list`, `set`, `applyBatch`, `clear`
- durability: WAL with `synchronous=FULL`, matching the desktop contract
- validation: Android's bundled SQLite has no `json_valid()` before API 34, so
  the Android schema omits the `CHECK (json_valid(value))` constraint and the
  native store validates JSON syntax before every write

Saves persist across app updates and are removed on uninstall. Auto Backup and
device transfer include `runtime.db` and its WAL file (open decision 4).

### Template Build And Release

Add `scripts/build-android-player-template.js` and
`player-template:build:android`:

1. run `build:bundle` for the player and persistence host bundles
2. stage the web content into `android/player/app/src/main/assets/web/`
3. build the JNI reader for all four ABIs, reusing the NDK resolution in
   `scripts/build-android-rust.sh`
4. run `./gradlew :app:assembleRelease` for the unsigned release APK
5. validate the APK (see below) and locate the color values with the exporter
   crate's minimal `resources.arsc` reader
6. write `RouteVNPlayerTemplate.apk` and a `RouteVNPlayerTemplate.json`
   descriptor to `src-tauri/assets/player-templates/android/`, with a README
   like the Windows and macOS templates

Template validation fails the build when:

- any `META-INF` signature file or APK Signing Block is present
- the merged manifest declares a provider, service, receiver, or permission
  that the template does not explicitly allow
- the application is debuggable
- `minSdk` or `targetSdk` differs from the expected values
- a `.so` is compressed or not 16 KiB aligned, or `resources.arsc` is
  compressed or not 4-byte aligned
- an expected launcher or splash icon entry is missing or has unexpected
  dimensions
- `player_icon_background` or `player_splash_background` is missing, is not a
  simple color value, or does not hold its reserved template value

The descriptor records:

- descriptor format version and player shell version
- template application ID
- `minSdk`, `targetSdk`, and ABIs
- every manifest string derived from the template application ID
- image slots: ZIP entry name, kind (legacy launcher, adaptive foreground, or
  splash), and pixel size; resource paths can be shortened by AGP, so the
  exporter uses the recorded entry names rather than assuming source paths
- color slots: resource name, reserved template value, and the byte offset of
  every value for that resource in `resources.arsc`
- SHA-256 of the APK

The template is built locally and committed as a regular Git file, matching
the Windows and macOS policy. The build host needs JDK 17, the Android SDK, and
the NDK, the same setup as Creator Android development. Ordinary users never
run this build.

Exported games keep the `targetSdk` of the template they were built from.
Store target-SDK requirements rise every year, so the template needs a yearly
rebuild and creators need to re-export to pick it up.

## Exporter

### Shared Rust Crate

Add a pure Rust crate, `crates/routevn-android-export`, that works on normal
filesystem paths and has no Tauri, JNI, or Swift dependencies. The Tauri
command, the Android JNI wrapper, and the iOS C-ABI wrapper all call it.

Memory stays bounded on every host, because phones cannot hold a large game in
memory:

- write `package.bin` to a temporary file instead of building it in memory
- encrypt it segment by segment into a temporary payload file
- copy the payload into the APK as a stream
- report progress through a callback the host bindings forward to the UI

If the existing native exporters build the whole package in memory, change the
shared path to stream rather than adding an Android-only copy.

Inputs:

- template APK path and descriptor
- output path
- game assets and instructions, in the same form the existing native exporters
  accept
- application ID, application name, version name, version code
- orientation (`landscape` or `portrait`)
- icon bytes
- icon background color and splash background color

Steps:

1. validate inputs and the template SHA-256
2. build `package.bin` with the existing `routevn-exporter`, including sprite
   dicing
3. encrypt it into a standalone payload with the `routevn-packager` writer,
   using an empty prefix
4. rewrite `AndroidManifest.xml`
5. patch the color values in `resources.arsc`
6. render launcher and splash icons
7. stream the new APK to `<output>.part`
8. validate the written APK
9. rename it into place; remove temporary files after success or failure
10. return export statistics

### Binary Manifest Rewrite

Implement a small reader and writer for Android binary XML in the crate: the
string pool in both UTF-8 and UTF-16 forms, the resource map, and namespace
and element chunks.

The exporter changes:

- the `package` attribute
- every string equal to the template application ID or starting with it
  followed by `.`, such as permission names or authorities that dependencies
  derive from the application ID
- the `android:label` literal
- `android:versionCode`, an integer value
- `android:versionName`
- the activity's `android:screenOrientation`

It rebuilds the string pool rather than patching it in place, keeps the
resource-map-indexed attribute names at their positions, and recomputes chunk
sizes. After writing, it parses the manifest again and requires the expected
values and no remaining template application ID.

### Color Patch

`resources.arsc` keeps its structure. Its package name is the template's Java
namespace, and Android does not require that to match the application ID.

The exporter changes only the two color values. A color is a fixed 4-byte ARGB
value, so it is overwritten in place at the offsets recorded in the
descriptor, and the file size and alignment do not change. Before writing, the
exporter checks that each offset still holds the reserved template value and
fails otherwise. Both colors are opaque; the exporter rejects alpha other than
fully opaque.

### Icons

The exporter uses the square PNG, JPEG, or WebP icon from Android Platform
Details:

- legacy launcher icon: 48, 72, 96, 144, and 192 px
- adaptive foreground: 108, 162, 216, 324, and 432 px canvases, with the icon
  scaled to the centered 72 dp visible area; transparent parts of the icon
  show the background color
- splash icon: 288 dp canvases (288 to 1152 px), with the whole icon fitted
  inside the centered 192 dp circle that Android keeps visible, over a
  transparent background so the splash background color shows around it

Launchers with circular masks crop the launcher icon's corners; the Platform
Details description says so. Separate foreground, background, and splash
image uploads are a later improvement.

### APK Writing

- copy template entries in their original order; copy unchanged entries' raw
  compressed data without recompressing
- replace the manifest, `resources.arsc`, and image entries; keep
  `resources.arsc` stored and 4-byte aligned
- drop `META-INF/MANIFEST.MF`, `*.SF`, `*.RSA`, `*.DSA`, and `*.EC`; writing a
  new central directory also drops any APK Signing Block
- add `assets/routevn-package.bin` as a stored entry
- align stored entry data to 4 bytes and stored `.so` data to 16 KiB by
  padding the local header extra field, matching `zipalign -P 16 4`
- use fixed entry timestamps and order, so the same inputs and the same
  package key produce the same bytes; each real export still uses a fresh
  random key, and tests supply a fixed one, as the Windows stamping command
  already allows
- refuse output that would need ZIP64 (more than 4 GiB or 65,535 entries) with
  a stable, user-facing error; Android APK tooling does not reliably accept
  ZIP64 APKs

The exporter validates every output before renaming it into place:

- the archive reopens and every entry is readable
- the alignment rules hold
- the manifest parses with the expected values
- both color offsets hold the requested colors
- no signature files are present
- the payload header and footer read correctly with the `routevn-packager`
  reader

### Desktop Host (Tauri)

Add `src-tauri/src/export_android.rs` and register it in `src-tauri/src/lib.rs`:

- `get_android_export_host_capabilities`: available when the bundled template
  and its descriptor are present and valid; no OS restriction
- `export_android_apk`: runs the shared crate on a blocking thread and returns
  statistics or a stable error category

Bundle `player-templates/android/RouteVNPlayerTemplate.apk` and its descriptor
as Tauri resources in `src-tauri/tauri.conf.json`.

### Android Creator Host

- add a JSON-in, JSON-out export method to `crates/routevn-exporter-jni` that
  calls the shared crate; the Android Rust build already produces this library
  for all four ABIs
- ship the template and descriptor in the Creator APK assets and copy them to
  the app cache on first use per Creator version, so Rust reads a normal file
- resolve project asset paths in Java, as the current native distribution ZIP
  export does
- write the APK to the app cache, then copy it to the selected SAF URI, like
  the current distribution ZIP export
- capability: available when the bundled template and descriptor are present
- the Creator APK grows by the template size

The Creator app is distributed on Google Play. It only writes the exported APK
to a file the user chose; it never installs it, so it does not request
`REQUEST_INSTALL_PACKAGES`. Check that Play review accepts the bundled template
APK in assets before the first Play release that includes it.

### iOS Creator Host

The iOS Creator builds its web export ZIP natively in Swift and does not link
Rust today. Android export adds Rust to the iOS build, rather than
reimplementing the exporter in Swift:

- add `crates/routevn-exporter-ffi`, a C-ABI wrapper over the shared crate with
  one JSON-in, JSON-out export function, a progress callback, and a function
  that frees returned strings
- add `scripts/build-ios-rust.sh` to build a static XCFramework for
  `aarch64-apple-ios`, `aarch64-apple-ios-sim`, and `x86_64-apple-ios`, and link
  it into `ios/routevn/routevn.xcodeproj`
- add a bridge method in `RouteVNApp.swift` that resolves project asset paths
  in Swift and calls the wrapper off the main thread
- stage the output and publish it through `SaveFileDestinations`, the same
  path the web export ZIP uses, including cleanup of partial files
- ship the template and descriptor as app bundle resources; Rust reads them in
  place
- capability: available when the bundled template and descriptor are present

On iOS the template APK is inert data: nothing in it is loaded or executed.
The iOS build host needs the Rust iOS targets installed; update `docs/ios.md`
with that setup. App users install nothing.

## Application Identity

The Android application ID (package name) identifies the game permanently.
Android installs an update only when it has the same application ID and the
same signing key. Two games must never share an application ID.

Add an `android` platform to Platform Details, stored as
`platformDetails.android` with:

- `applicationName`
- `iconFileId`
- `applicationIdentifier`
- `iconBackgroundColor`: opaque `#RRGGBB`, default `#FFFFFF`; shows through
  transparent parts of the adaptive launcher icon
- `splashBackgroundColor`: opaque `#RRGGBB`, default `#000000`; fills the
  launch splash screen around the game icon

Validation:

- at least two segments separated by periods
- each segment starts with an ASCII letter and contains only ASCII letters,
  digits, and underscores
- hyphens are not allowed, unlike Windows and macOS identifiers
- reject the template application ID and `com.routevn.creator`

The identifier description warns that changing it after release creates a
different app that cannot update the old one.

Update the project-metadata normalizers in the web, Tauri, Android, and iOS
adapters, the import and export round trips, and
`docs/platform/06-project-identity-and-metadata.md` and
`docs/platform/07-persisted-key-catalog.md` together, so no platform silently
drops `platformDetails.android`.

## Native Version Contract

The export confirmation collects:

```text
android:versionName = <entered Version>
android:versionCode = <entered Build Number>
```

- Version is prefilled from the selected release name and validated with the
  existing `major.minor.patch` rule in `src/internal/nativeApplicationVersion.js`;
  rename the macOS-specific validator to a shared name when Android starts
  using it
- Build Number starts blank and must be an integer from 1 to 2,100,000,000, the
  largest value Google Play accepts
- the description explains that each release must use a higher Build Number
  than the one players already installed
- neither value is persisted, matching macOS, unless the open decision below
  changes that

## Service And UI Work

Shared export facade operations:

```text
getAndroidExportAvailability
promptAndroidApkPath
createAndroidApkToPath
```

Platform Details:

- an Android tab with application name, icon, application ID, icon background
  color, and splash background color, using the existing `color-picker` form
  field
- a preview of the launcher icon under a circular and a rounded-square mask,
  and of the splash screen, so creators can see cropping before exporting
- Android-specific validation messages

Versions page:

- Android export availability state, selectors, and refresh during page setup
- an **Export for Android (unsigned APK)** action in desktop and mobile
  layouts on the Tauri, Android, and iOS Creator, shown only when the host's
  capability check passes; the web Creator never shows it because its adapter
  has no Android export capability
- missing Android Platform Details opens setup, as for Windows and macOS
- a confirmation dialog with release, name, icon, application ID, Version, and
  Build Number, plus a notice that the APK must be signed before it can be
  installed or distributed
- an `.apk` save dialog with a default file name
- progress, completion, and failure feedback; an unexpected failure shows an
  alert with `withErrorDetails(...)`

Add localized copy to every catalog in `src/i18n/` and keep
`scripts/check-i18n.js` passing.

Primary implementation areas:

- `android/player/`
- `scripts/player-templates/android/index.html`
- `scripts/build-android-player-template.js`
- `scripts/vite.player-runtime-host.config.js`
- `src/deps/clients/android/` (player persistence database client)
- `crates/routevn-android-export/`
- `crates/routevn-packager/` (Android JNI reader target)
- `crates/routevn-exporter-jni/`
- `crates/routevn-exporter-ffi/`
- `src-tauri/src/export_android.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/assets/player-templates/android/`
- `android/routevn/` (bridge method, bundled template)
- `ios/routevn/` (bridge method, XCFramework, bundled template)
- `scripts/build-android-assets.js` and `scripts/build-ios-assets.js` (copy the
  template into the mobile apps)
- `scripts/build-ios-rust.sh`
- `src/internal/ui/platformDetailsForm.js`
- `src/pages/platformDetails/`
- `src/deps/services/shared/projectRepositoryService.js`
- `src/deps/services/shared/projectExportService.js`
- `src/deps/services/shared/projectServiceCore.js`
- `src/deps/services/tauri/projectServiceAdapters.js`
- `src/deps/services/android/projectServiceAdapters.js`
- `src/deps/services/ios/projectServiceAdapters.js`
- `src/pages/versions/versions.store.js`
- `src/pages/versions/versions.handlers.js`
- `src/pages/versions/versions.view.yaml`
- `src/pages/versions/support/versionsPageCopy.js`
- `src/i18n/*.yaml`

## Dependency Boundary

The ordinary user's machine gains no separately installed dependencies.

Expected repository impact:

- no new JavaScript package
- `androidx.webkit` and `androidx.core:core-splashscreen` in the player
  template only
- existing Rust ZIP, image, and encryption dependencies cover the exporter;
  the binary XML reader and writer and the minimal `resources.arsc` reader the
  template build uses to record color offsets are written in the crate
- the template APK increases the desktop, Android, and iOS Creator download
  sizes by roughly the player bundle (about 3 MB) plus the JNI libraries
- the iOS Creator gains a Rust static library; its build host needs the Rust
  iOS targets

The implementation must not fall back to running Gradle during an export.

## Testing

Rust unit tests in CI:

- binary XML round trips for UTF-8 and UTF-16 string pools
- application ID replacement, including derived strings, with class names
  untouched
- label, version, and orientation edits
- color patches, including refusal when an offset does not hold the reserved
  template value
- launcher and splash icon rendering sizes and placement
- alignment of stored entries and native libraries
- signature file removal and absence of an APK Signing Block
- identical bytes for identical inputs with a fixed test key
- a host-side round trip through the C-ABI wrapper; the JNI and iOS paths are
  covered by the acceptance script
- the ZIP64 refusal

JavaScript unit tests:

- Android application ID validation
- Platform Details Android tab
- Versions availability gating and confirmation form validation

Local acceptance script (needs the Android SDK; not part of CI):

1. export a fixture project from each host: Creator desktop, the Creator
   Android app, and the Creator iOS app
2. `zipalign -c -P 16 -v 4` passes on each unsigned APK
3. sign with a throwaway key using `apksigner`
4. `apksigner verify --min-sdk-version 24` passes
5. `aapt2 dump badging` shows the expected package, label, version name, and
   version code
6. install on an emulator and a physical device; confirm the launcher icon,
   the icon background color, and the splash screen icon and color on Android
   12 or later and on Android 11 or earlier; confirm the splash stays until
   the first frame
7. play, save, force-stop, relaunch, and load
8. install two exported games side by side
9. install an update with a higher Build Number over the first install and
   confirm saves remain
10. on the Android and iOS Creator, export a large fixture project (at least
    1 GB of assets) on a low-memory phone and confirm memory stays bounded and
    cancellation or failure leaves no partial file

## Implementation Phases And Gates

### Phase 0: Spikes

- serve `206` responses for `package.bin` from `shouldInterceptRequest` to the
  player's `fetch`
- rewrite the application ID of a hand-built template, sign it, and install two
  copies side by side
- read decrypted payload ranges through JNI from a stored asset file
  descriptor

Gate: all three work on a current device and on the oldest WebView version we
support at API 24.

### Phase 1: Player Template

- `android/player/` shell, package serving, persistence bridge, and Android
  persistence host bundle
- splash screen with the first-frame keep-on-screen signal and timeout
- template build script, validation, and descriptor

Gate: a hand-assembled, manually signed APK plays a fixture project, the
splash stays until the first frame, and saves survive relaunch and an update
install.

### Phase 2: Exporter Crate

- binary manifest rewrite, color patch, launcher and splash icons, payload,
  APK writer, and output validation

Gate: acceptance steps 2 through 9 pass for an APK produced by a crate-level
test harness.

### Phase 3: Desktop Creator Integration

- Tauri command and resources, service facade, Platform Details Android tab,
  Versions UI, and localized copy

Gate: exports from Creator desktop on Windows, macOS, and Linux install and run
after signing.

### Phase 4: Android Creator Host

- JNI export method, bundled template, Android adapter, and SAF output

Gate: an export made on an Android device installs and runs after signing, and
the large-project export stays within memory.

### Phase 5: iOS Creator Host

- C-ABI wrapper, iOS Rust build and XCFramework, Swift bridge method, bundled
  template, iOS adapter, and `SaveFileDestinations` output

Gate: an export made on an iPhone installs and runs on an Android device after
signing, and the large-project export stays within memory.

## Out Of Scope

- signing
- Android App Bundles and Google Play publishing
- the web Creator as an export host
- per-game custom native code
- separate adaptive icon layers, round icons, and themed icons
- a separate splash image, animated splash icons, and the Android 12 splash
  branding image
- full-screen splash images, which Android's system splash does not support;
  creators can build an opening scene in the game instead
- localized application names
- ZIP64 APKs

## Open Decisions

1. **Encrypted package.** Recommended: use the encrypted payload and JNI
   reader, matching Windows and macOS. Alternative: ship plain `package.bin`
   like the web export and drop the JNI library, at the cost of making assets
   trivially extractable from the APK.
2. **Release order.** Recommended: ship each host when its phase gate passes,
   desktop first, then Android, then iOS. Alternative: hold the feature until
   all three hosts pass, so every native Creator gets it in the same release.
3. **Build Number persistence.** Recommended for the first release: do not
   persist, matching macOS. Alternative: store the last exported Build Number
   in `platformDetails.android` and prefill the next value.
4. **Auto Backup of saves.** Recommended: enable Android Auto Backup for
   `runtime.db` only, so saves can survive a reinstall or a new phone; verify
   the restore behavior during Phase 1.
5. **Orientation.** Recommended: derive it from the project resolution.
   Alternative: an explicit Android Platform Details setting.
6. **Default application ID.** Recommended: no prefill, matching the other
   platforms, with a format hint in the field description.
7. **Splash icon source.** Recommended for the first release: reuse the game
   icon, fitted inside the splash circle. Alternative: a separate optional
   splash image upload, useful when the launcher icon has a busy background
   that looks wrong on the splash color.
8. **One or two background colors.** Recommended: two fields, because a
   launcher icon background and a splash background often differ (for example
   white behind the icon, black splash for a dark game). Alternative: one shared
   color for a simpler form.
