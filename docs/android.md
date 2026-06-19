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
- AndroidX WebKit: `1.16.0`

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

`static/android/index.html` defines Android runtime endpoints through
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

The WebView loads packaged assets through `WebViewAssetLoader` at:

```text
https://appassets.androidplatform.net/web/index.html
```

This gives the local bundle an HTTPS origin while serving packaged app files.

## Build And Install

Build Android web assets:

```bash
bun run build:android
```

Build the debug APK:

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

Build a release app bundle:

```bash
bun run android:bundle
```

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
- SQLite open/query/exec/close
- project file read/write/metadata
- download writes
- Android document picker results

Project files are stored in app-private storage and served back through
`/android-files/`. For media assets, Android returns typed URLs such as:

```text
/android-files/projects/<projectId>/typed-files/<fileId>/asset.png
```

The typed filename lets Pixi choose the right image/video parser while the
native handler maps the request back to the extensionless stored project file.

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
