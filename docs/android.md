# Android WebView App

The Android app is a native WebView shell around the web build. It does not use
Tauri mobile.

## Version Pins

- Android Gradle Plugin: `9.2.0`
- Gradle wrapper: `9.4.1`
- Java language level: `17`
- `compileSdk`: `37`
- `targetSdk`: `37`
- `minSdk`: `24`
- AndroidX WebKit: `1.16.0`

These were selected from current Android developer docs for Android 17 SDK,
AGP 9.2, and AndroidX WebKit stable releases.

## Project Layout

- `src/setup.android.js`: Android runtime entrypoint.
- `src/deps/clients/android/router.js`: in-memory router for native back.
- `static/android/index.html`: Android asset HTML template.
- `scripts/build-android-assets.js`: copies `_site` output into Android assets.
- `android/routevn`: native Android project.

The WebView loads local assets through `WebViewAssetLoader` at
`https://appassets.androidplatform.net/web/index.html`. This keeps the app on an
HTTPS origin while serving packaged files.

## Commands

Build web assets for Android:

```bash
bun run build:android
```

Install a debug build on a connected device or emulator:

```bash
bun run android:install
```

Build a release app bundle:

```bash
bun run android:bundle
```

For release signing, provide these environment variables before running the
bundle command:

```bash
ANDROID_KEYSTORE_PATH=/path/to/upload-keystore.jks
ANDROID_KEYSTORE_PASSWORD=...
ANDROID_KEY_ALIAS=...
ANDROID_KEY_PASSWORD=...
```

If signing variables are not present, Gradle can still build an unsigned release
artifact for local inspection.

## Native Bridge

The native bridge is intentionally small:

- `RouteVNAndroid.updateBackState(canGoBack)`: receives router back state from
  the web app.
- `RouteVNAndroid.openExternalUrl(url)`: opens external links outside the
  WebView.

File inputs are handled by the Activity's `WebChromeClient`, so existing web
picker flows continue to work inside Android.
