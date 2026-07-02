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

## Lessons Learned

Android WebView bugs should be validated on a real Android WebView whenever the
behavior is user-visible. Desktop browser and Tauri checks are useful, but they
can miss Android-specific parser, layout, asset, and bridge behavior.

### Build And Blank Screens

- After JS, YAML view, or setup changes, reinstall with `bun run
  android:install`. A native reinstall without rebuilding Android web assets can
  leave the device running stale JavaScript.
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
