# Android Development

RouteVN Creator's Android app is a native Android WebView shell around the web
build. It does not use Tauri mobile.

The Android app lives in `android/routevn` and loads the Android frontend bundle
built from `src/setup.android.js`.

## Version Pins

The Android project should stay on the newest stable Android toolchain versions
we have adopted in Gradle. Update this section in the same PR when changing
Gradle pins.

- Android Gradle Plugin: `9.2.0`
- Gradle wrapper: `9.4.1`
- Java language level: `17`
- `compileSdk`: `37`
- `targetSdk`: `37`
- `minSdk`: `24`
- Build tools: `37.0.0`
- NDK: `29.0.14206865`
- AndroidX Core Splashscreen: `1.2.0`
- AndroidX WebKit: `1.16.0`
- Google Play In-App Updates: `2.1.0`

## Local Setup

Install:

- Android Studio, or Android command line tools.
- JDK 17.
- Android SDK platform `android-37`.
- Android SDK build tools `37.0.0`.
- Android SDK platform tools.
- Android NDK `29.0.14206865`.

Recommended shell environment:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_NDK_HOME="$ANDROID_HOME/ndk/29.0.14206865"
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

If Gradle cannot find the SDK, create `android/routevn/local.properties`:

```properties
sdk.dir=/Users/<user>/Android/Sdk
```

`local.properties` is local-only and must not be committed.

## Endpoint Configuration

`static/public/android-env.js` defines Android runtime endpoints through
`window.env`:

- `ROUTEVN_API_ENDPOINT`

Committed defaults intentionally use `example.invalid` placeholders. Configure a
real API endpoint outside committed source for private local, staging, or release
builds.

Remote collaboration is disabled in Android setup for now. Android still uses
the project service's local command session and native SQLite-backed storage.

## Project Layout

- `src/setup.android.js`: Android runtime entrypoint.
- `src/deps/clients/android/`: low-level Android client adapters.
- `src/deps/services/android/`: Android service adapter composition.
- `static/android/index.html`: Android asset HTML template.
- `scripts/build-android-assets.js`: copies `_site` output into Android assets.
- `android/routevn`: native Android project.
- `android/routevn/app/src/main/java/com/routevn/creator/MainActivity.java`:
  native WebView shell and JavaScript bridge.

Release builds load packaged assets through `WebViewAssetLoader` at:

```text
https://appassets.androidplatform.net/web/index.html
```

This gives the local bundle an HTTPS origin while serving packaged app files.

### Startup Splash

The native shell uses AndroidX Core Splashscreen with the default exit behavior.
The splash is dismissed as soon as the frontend sends `markSplashReady` and the
system bar insets have been applied. There is no minimum display duration.

A single five-second fallback is scheduled at activity creation so a missing
readiness signal does not hold the splash indefinitely. Dismissing the splash
or destroying the activity cancels the fallback.

## Build And Install

### Android JS Watch Mode

Debug Android builds use packaged assets by default, just like release builds.
The local Android dev server is an explicit launch-time opt-in:

```text
http://127.0.0.1:3001/android/index.html
```

Install the debug app once after native Android changes:

```bash
bun run android:install
```

Then run the Android frontend watch server:

```bash
bun run watch:android
```

`watch:android` prepares `_site`, runs `adb reverse tcp:3001 tcp:3001` when a
device is connected, and starts `rtgl fe watch` with `src/setup.android.js`.
After the server is ready, launch the installed debug app with the explicit
development extra:

```bash
adb shell am start -S -n com.routevn.creator/.MainActivity \
  --ez routevnUseDevServer true
```

JS, YAML view, store, handler, i18n, and setup changes are then served from the
dev server. A normal launcher start does not set this extra and uses packaged
JavaScript instead.

If multiple Android devices are connected, set `ANDROID_SERIAL` before running
the watch command:

```bash
ANDROID_SERIAL=<device-serial> bun run watch:android
```

Release builds always load packaged assets through `WebViewAssetLoader`.

### Native Shell And Packaged Assets

Build Android web assets:

```bash
bun run build:android
```

Build the debug APK. Debug builds use these packaged assets unless explicitly
launched with the development intent extra described above:

```bash
cd android/routevn
./gradlew :app:assembleDebug
```

Install the debug APK on a connected device or emulator:

```bash
adb install -r android/routevn/app/build/outputs/apk/debug/app-debug.apk
```

Or use the combined script:

```bash
bun run android:install
```

Build a release app bundle to validate packaged web assets:

```bash
bun run android:bundle
```

### Google Play Updates

`android:bundle` sets `-ProutevnDistribution=google-play`. Other Gradle builds
default to `direct`; direct release builds do not enable the Play updater. To build a
Play APK explicitly, use `./gradlew :app:assembleRelease -ProutevnDistribution=google-play`.
Keep increasing Android `versionCode` for each published release.

The native adapter requires an enabled Play Store. Release builds additionally
require the app's installing package to be `com.android.vending`; other release
distributions continue working with update controls hidden. An unavailable Play
API or an unowned app disables checking for the session in release builds.

Debug builds enable the Play updater even when installed through USB. About keeps
**Check for Updates** available after Play reports an unavailable API or an unowned
app, so developers can retry. Checks still use the real Play API and its eligibility
rules. Unavailable updates and network/check failures remain silent for automatic
checks and show feedback for manual checks.

Android and direct desktop builds share `automaticUpdateChecks.js`: check at
startup, then poll every ten minutes and check again once more than two hours
have elapsed. About exposes **Check for Updates** when the adapter supports it.
Android skips background checks without advancing the last-check timestamp.

Android uses Google's flexible update flow. Downloading allows continued editing;
the downloaded update asks the user to restart. Restart first runs the existing
pre-navigation save hooks and flushes user settings. Save failures prevent the
restart. Update requests are asynchronous and do not block the native storage
executor. A native install listener and resume check recover completed downloads.

Validate actual Play delivery using
[internal app sharing](https://developer.android.com/guide/playcore/in-app-updates/test):

1. The Play Console account owner must accept the Internal App Sharing terms.
2. Enable Internal App Sharing in the phone's Play Store settings. Tap the Play
   Store version seven times under About to expose its developer options.
3. Upload and install a lower-version-code Play build from its sharing link. It
   must already contain the updater. Export local projects before uninstalling a
   development build with a different signing certificate.
4. Upload a higher-version-code build to Internal App Sharing. Open its sharing
   link on the phone, but do not install it from the Play Store page.
5. Return to RouteVN and use About's Check for Updates action. Accept the download,
   then accept Restart and Update when it is ready.

Both builds need matching application IDs/signing certificates, and the tester's
Google account must have downloaded the app from Play at least once. The Android
`versionCode` determines update eligibility; About currently displays the shared
app version, which can stay unchanged when only native test versions are changed.
A locally sideloaded debug APK can exercise checks and unavailable-install
feedback. Use the Play installation steps above to validate actual update delivery.

Run `bunx vitest run tests/android/updater.test.js tests/appService/mobileUpdateSetup.test.js`
for update-flow and save-before-restart coverage. Shared alert/confirm spacing is
owned and visually tested by Rettangoli; the client must consume its fix through
a published dependency version, as required by the
[dependency ownership rules](engineering.md#dependency-ownership). The app-owned
progress dialog uses the dialog primitive's single layer of padding.

## Release Signing

For release signing, provide these environment variables before running the
bundle command:

```bash
export ANDROID_KEYSTORE_PATH=/path/to/upload-keystore.jks
export ANDROID_KEYSTORE_PASSWORD=...
export ANDROID_KEY_ALIAS=...
export ANDROID_KEY_PASSWORD=...
```

`ANDROID_KEY_PASSWORD` defaults to `ANDROID_KEYSTORE_PASSWORD` when omitted.

If signing variables are not present, Gradle can still build an unsigned release
artifact for local inspection.

## Native Adapters

Android uses native adapters instead of Tauri mobile APIs.

- Router: `src/deps/clients/android/router.js`
- SQLite: `src/deps/clients/android/sqlite.js`
- File picker: `src/deps/clients/android/filePicker.js`
- Project services: `src/deps/services/android/`

The native bridge in `MainActivity.java` handles:

- route back-state updates and Android back dispatch
- external URL opening
- named global app-database operations
- project-only SQLite open/query/exec/close
- project file read/write/metadata
- download writes
- Android document picker results

## Private Storage Layout

The global app database uses Android's standard database directory, while every
project is one self-contained directory under the app-private files directory:

This is RouteVN Creator's first supported Android storage layout. No released
Android build used another storage root, so there is no upgrade migration.

```text
databases/app.db

files/projects/<projectId>/
  project.db
  project.db-wal
  project.db-shm
  files/<fileId>
  file-metadata/<fileId>.mime
```

`databases/` and `files/` in this diagram are Android backup domains, not
sibling directories returned by the same API. `app.db` is resolved with
`getDatabasePath("app.db")`; project roots are resolved below `getFilesDir()`.

The native database contract remains deliberately narrow:

- the global `app.db` is accessed only through named key/value and event
  operations
- the raw SQLite bridge accepts only
  `projects/<projectId>/project.db`, one statement per request, and the query,
  schema, transaction, and write statement classes used by the project store
- all other database paths and statement classes are rejected

Project discovery requires both `project.db` and `files/`, so incomplete
directories are not listed as valid projects.

Project files are stored in app-private storage and served back through
`/android-files/`. For media assets, Android returns typed URLs such as:

```text
/android-files/projects/<projectId>/typed-files/<fileId>/asset.png
```

The typed filename lets Pixi choose the right image/video parser while the
native handler maps the request back to the extensionless stored project file.
The file handler accepts only project-asset and picker-file routes; database,
WAL, metadata, staging, and unrelated private paths are not served.

## WebView Security Boundary

The WebView does not use `addJavascriptInterface`. Native operations are
provided through AndroidX `addWebMessageListener` with a versioned asynchronous
request protocol. The native listener accepts only main-frame messages from:

- `https://appassets.androidplatform.net` in every build
- `http://127.0.0.1:3001` only when a debug build is explicitly launched with
  `routevnUseDevServer=true`

There is no wildcard-origin or compatibility fallback. A WebView without the
origin-scoped message-listener feature fails closed instead of exposing a less
safe bridge.

The Android document uses a restrictive Content Security Policy: scripts must
come from the document origin, frames and objects are disabled, and inline
scripts are not permitted. Internal-file CORS responses name the one expected
origin for the build. Direct `file://` and `content://` access, automatic
JavaScript windows, and third-party cookies are disabled.

Authentication and refresh tokens are removed from the serialized
`userConfig` value before `app.db` is written. The opaque session JSON is
encrypted with an AES-GCM key generated in Android Keystore; only ciphertext is
stored in the excluded `auth-secrets` preferences file. The session is merged
back into the in-memory config only when the app reads its named global state.

## Backup And Device Transfer

`android:allowBackup` is enabled as the master switch, but RouteVN does not use
Android Auto Backup for cloud project recovery. Projects commonly contain media
and can exceed Auto Backup's 25 MB per-app cloud quota.

The configured policy is:

- cloud backup contains no current RouteVN app data
- Android 12+ device-to-device transfer includes only the complete `projects/`
  root
- Android 9–11 includes `projects/` only when the backup transport declares a
  device-to-device transfer
- Android 7–8 backs up no RouteVN app data because those versions cannot apply
  the device-to-device-only condition
- the global `app.db` and Keystore-encrypted authentication secret are never
  backed up or transferred
- picker files, staging files, preferences, and other private files are not
  backed up or transferred

Manual project export remains the recovery mechanism until RouteVN provides a
project-aware cloud backup or synchronization service. Android device transfer
is a convenience and must not be presented as the user's only backup.

## Android Back

Native back calls `window.routeVNNativeBack()`.

The web app handles back in this order:

1. Dispatch `app.nativeBack` so mounted overlays can consume the event.
2. If a `rvn-vn-preview` is open, it closes the preview and prevents route
   navigation.
3. If nothing handles the event, the Android router goes back.
4. If the web app cannot handle back, the Activity finishes.

## Debugging

Clear and inspect Android logs:

```bash
adb logcat -c
adb logcat -s RouteVNAndroid chromium AndroidRuntime
```

Launch the app:

```bash
adb shell am start -n com.routevn.creator/.MainActivity
```

Find the app process:

```bash
adb shell pidof com.routevn.creator
```

Forward the WebView DevTools socket:

```bash
adb forward tcp:9229 localabstract:webview_devtools_remote_<pid>
```

Then open:

```text
http://127.0.0.1:9229/json/list
```

Useful symptoms:

- Black VN preview or scene editor canvas usually means asset loading failed.
  Check for Pixi warnings about unparseable URLs or missing cache entries.
- Broken uploaded images usually means file MIME metadata or `/android-files/`
  serving is wrong.
- Silent upload failure should be debugged through the Android file picker
  bridge and user-facing upload toasts.

## Lessons Learned

Android WebView bugs should be validated on a real Android WebView whenever the
behavior is user-visible. Desktop browser and Tauri checks are useful, but they
can miss Android-specific parser, layout, asset, and bridge behavior.

### Build And Blank Screens

- During Android JS watch mode, JS, YAML view, store, handler, i18n, and setup
  changes should refresh from `http://127.0.0.1:3001/android/index.html`
  without reinstalling the APK.
- For packaged-asset validation, build a release bundle with `bun run
android:bundle`. A native release build without rebuilding Android web assets
  can package stale JavaScript.
- If an explicitly dev-server-launched app shows a WebView network error,
  confirm `bun run watch:android` is running and
  `adb reverse tcp:3001 tcp:3001` is active for the device.
- Android builds must use the local `rtgl` dev dependency through
  `scripts/build.sh`, not a globally installed `rtgl` CLI. The local build
  preserves the repo's `rettangoli.config.yaml` options, including `i18n`.
- If the app shell loads but the page is blank, check `adb logcat` first. Recent
  blank screens were caused by frontend render errors such as missing i18n
  catalogs or Rettangoli parser failures, not native Activity failures.
- The Android build log should show `Building frontend bundle with
src/setup.android.js` and include the configured `i18n` block. If it does not,
  the APK may not match the web bundle contract expected by the app.

### WebView Validation

- Use WebView DevTools through `adb forward` to inspect the actual Android DOM,
  scroll geometry, and console state.
- Prefer measuring layout facts over eyeballing: `clientHeight`,
  `scrollHeight`, `scrollTop`, item rects, and spacer rects reveal whether a
  view has real scroll range or only visual-looking space.
- For mobile resource pages, validate the user path through the bottom tab and
  action sheet. Direct route navigation can miss action-sheet timing and mounted
  mobile layout state.

### Performance

The working goal for mobile navigation is under 500 ms from user action to a
painted first useful page. Treat that as an end-to-end budget, not only a
JavaScript function budget.

Measure on the large/current project, not only a tiny fixture project. Small
projects can hide store/view construction costs, resource-tree size effects, and
asset-heavy page behavior.

Keep navigation timing logs at concrete boundaries while investigating:

- interaction received
- bottom action-sheet render start/end
- route subscription received
- route transition start
- route initial render start/end
- project-entry refresh start/end
- repository ensure start/end
- route final render start/end
- route transition complete
- paint `requestAnimationFrame` 1 and 2

Use the bottom-left tab and action-sheet path for resource pages when measuring
touch navigation. Direct route navigation can miss the action-sheet work and the
same mounted mobile state users actually exercise.

Recent useful reference numbers from the older Android device on the large
project:

- action sheet open: about 40-60 ms
- sounds initial render: about 350 ms
- repository ensure when already opened: about 25 ms
- sounds route transition complete: about 385 ms
- sounds second paint frame: about 397 ms
- transforms route transition complete: about 200 ms

These numbers are not permanent targets; they are a sanity baseline. If a page
is above 500 ms, first identify which boundary regressed. If route timing is
under 500 ms but the page still feels delayed, inspect input-to-click latency,
action-sheet close timing, and first paint timing rather than only page render.

What we learned:

- Do not assume the slow part is visible media decoding. Characters had very
  little UI but still felt slow, which showed shared route/render work needed
  measurement too.
- Delaying lazy media hydration alone does not fix first render if placeholder
  and card tree construction are still expensive.
- Rendering empty space first makes layout drift worse and can feel slower even
  when JavaScript work is reduced. Progressive rendering should reserve stable
  card space with placeholders.
- Placeholder layout must have fixed dimensions that match the hydrated cards.
  Otherwise the page jumps after hydration and scroll measurements become
  misleading.
- Lazy image cards and lazy sound waveforms help only after the first render
  cost is separated from asset hydration cost. Keep those concerns measured
  separately.
- Per-folder blank reservation is wrong. It increases scroll height under every
  group and makes the resource grid look broken. Use real placeholders for
  items and a single trailing scroll spacer for bottom affordance.
- If small and large pages are both slow, look at app-level route orchestration,
  repository ensure, store selectors, and WebView rendering before changing
  resource-specific lazy-load delays again.

Android bridge work:

- Synchronous Android bridge calls are more expensive than equivalent in-memory
  web/Tauri paths. They block the WebView main thread while the native side
  responds.
- Avoid repeated per-item bridge or file metadata calls during page render.
  Cache, batch, or precompute file metadata at repository/page setup boundaries.
- Do not clone or read full repository state per asset. A per-file metadata
  lookup must use a lightweight selector or an adapter-specific fast path.
- Keep bridge work out of the first render when the UI can safely hydrate later.
  First render should build the stable shell and placeholders; expensive media
  previews can hydrate after paint.
- If Android has a synchronous metadata problem but web/Tauri does not, check
  whether web/Tauri are using in-memory metadata while Android crosses the
  native bridge.

When adding a performance optimization, record before/after numbers from the
same device, same project, and same navigation path. Otherwise it is easy to
"fix" a small-project path while leaving the real Android path unchanged.

### Resource Page Layout

- Bottom scroll affordance should be a single trailing spacer at the end of the
  scroll content, not per-folder `min-height` and not extra blank space below
  every grid group.
- `padding-bottom` on a custom scroll element is less reliable for Android
  WebView scroll range than an explicit trailing child inside the scroll
  content.
- For resource trailing spacers, use Rettangoli's `h` attribute and quote
  dynamic values:

  ```yaml
  - 'rtgl-view w=f h="${scrollBottomPadding}" style="flex-shrink: 0;"': null
  ```

  An unquoted value such as `h=${scrollBottomPadding}` can expand to
  `h=calc(96px + env(safe-area-inset-bottom))`, which the Rettangoli selector
  parser treats as invalid separate tokens.

- A `style="height: ${scrollBottomPadding};"` spacer can collapse in some
  nested resource scroll layouts. The `h` attribute path matches established
  app spacer usage and produced a real measured `96px` spacer on Android.
- Avoid passing optional dynamic padding props as `undefined` through a view
  binding when the mobile branch should use the component default. Prefer
  omitting the prop in the mobile branch and passing a static desktop value such
  as `scroll-bottom-padding=32vh` in the desktop branch.
- Normalize optional component props defensively when they can cross a view
  binding boundary. In practice, omitted values may arrive as `"undefined"` in
  some generated paths, so shared resolvers should treat that as absent when the
  prop is optional.

## Generated Files

Do not commit local Android outputs. The root `.gitignore` covers:

- `android/routevn/.gradle`
- `android/routevn/build`
- `android/routevn/app/build`
- `android/routevn/app/src/main/assets`
- `android/routevn/local.properties`
- Android Studio metadata
- NDK intermediates
- debug/release output folders
- keystore files

`android/routevn/app/src/main/assets` is generated by `bun run build:android`.
It is required for local APK builds but should remain untracked.
