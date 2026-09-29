# Mobile crash reporting

The Android and iOS apps send native crashes to the same Sentry-compatible
collector in `routevn-api-2` as the desktop app (see
[desktop error reporting](desktop-error-reporting.md)). Each platform uses the
official Sentry SDK with a thin wrapper, following the collector's
`specs/services/error-sdk-compatibility-v1.md`.

## What is reported

| Platform | SDK                                                             | Reported                                                                                              |
| -------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Android  | `io.sentry:sentry-android-core` and `sentry-android-ndk` 8.58.0 | Uncaught JVM exceptions and native signal crashes, including crashes in `libroutevn_exporter_jni.so`. |
| iOS      | `sentry-cocoa` 9.29.2 (Swift Package, exact version)            | Signals, Mach exceptions, uncaught `NSException`s and Swift runtime traps.                            |

Crash reporting only. Sessions, ANRs/app hangs, watchdog terminations,
breadcrumbs, screenshots, view hierarchies, swizzling, network tracking,
performance tracing, client reports and replay are disabled. The aggregate
`sentry-android` artifact is not used because it also ships replay.

Uncaught WebView JavaScript errors and unhandled rejections use the same
privacy-scrubbed browser reporter as desktop, with the native release, dist,
environment and DSN injected at document start. Each webview session sends at
most 10 JavaScript events.

### Android WebView renderer loss

Android kills the WebView renderer under memory pressure, and the renderer can
also crash. Left unhandled, Chromium aborts the app with a `SIGTRAP` whose
report only shows WebView internals. `MainActivity` handles
`onRenderProcessGone` by destroying the dead WebView and crashing the app with
`MainActivity$WebViewRendererKilledException` (memory kill) or
`MainActivity$WebViewRendererCrashedException`. The user sees the app close,
as before, and the report names the cause. iOS WebView content process
termination is not handled yet.

Both SDKs write every report to local storage before sending it and delete it
only after the collector accepts it. A crash report is saved before the process
exits; if it cannot be sent then, it is sent from local storage on the next
launch. A user who never reopens the app produces no report. There is no
crash-free-rate metric because sessions are disabled.

## Configuration

| Build   | Android                                                                                                                                                                  | iOS                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release | `app/build.gradle.kts` reads `ROUTEVN_SENTRY_DSN` from `.env.production` into `BuildConfig.SENTRY_DSN`; environment `production`. The build fails if the DSN is missing. | `Configure crash reporting` reads `ROUTEVN_SENTRY_DSN` from `.env.production`; environment `production`. Missing, empty or invalid HTTPS DSNs fail the build. |
| Debug   | No DSN, so nothing is reported. Pass `-ProutevnSentryDsn=<dsn>` to report to a collector; environment `development`.                                                     | `ROUTEVN_SENTRY_DSN` is empty. Pass `ROUTEVN_SENTRY_DSN=<dsn>` to `xcodebuild` to report; environment `development`.                                          |

The iOS Xcode build phase runs `scripts/configure-ios-crash-reporting.py` with
Xcode's Python 3. It generates an intermediate `Info.plist` that Xcode processes
and signs into the app; the source plist is never modified. Release always reads
`.env.production`, ignoring DSN overrides. Debug only reads the explicit
`ROUTEVN_SENTRY_DSN` build setting and permits HTTP for local collectors. The
phase runs on every build so changed configuration cannot reuse a stale DSN.
Only the DSN is read from the environment file, without executing its contents.

Run the configuration regression checks with:

```bash
python3 tests/ios/crashReportingConfiguration.py
```

Release name is `routevn-creator@<version>`, matching desktop. `dist` is the
Android `versionCode` or the iOS `CFBundleVersion`.

## Collection and privacy

`beforeSend` on each platform (`NativeCrashScrubber`) keeps:

- exception type, mechanism type and handled flag, and signal/Mach metadata
- stack frames: function, module, file basename, line, instruction and image
  addresses
- debug images that the frames point into, with file paths reduced to basenames
  but debug IDs, load addresses and sizes kept
- app release and dist, device model and architecture, OS name and version

It drops message and exception text (replaced with `App crash`), user,
request, tags, extras, breadcrumbs, server name, modules, device name and other
device state, frame variables and source context, and absolute paths. Limiting
debug images also keeps reports under the collector's 256 KiB event limit;
larger reports are rejected, not truncated.

The collector's server-side redaction only removes fixed structural fields, so
the client scrubbing is required.

## Symbols

Release builds retain matching JavaScript maps under
`.artifacts/crash-symbols/<platform>/<release>-<dist>/js/`, outside packaged
assets. They also retain native symbols:

- **Android:** release builds keep line numbers
  (`-keepattributes SourceFile,LineNumberTable`) and native symbol tables
  (`debugSymbolLevel = "SYMBOL_TABLE"`). `bundleRelease`/`assembleRelease` copy
  `mapping.txt`, its generated ProGuard UUID, unstripped JNI libraries, and
  `native-debug-symbols.zip` to
  `.artifacts/android-crash-symbols/<versionName>-<versionCode>/`.
  The JNI libraries are built with full debug info (the crate's own
  `[profile.release]`); Android Gradle strips the copy it packages, and the
  unstripped copies are the ones archived and uploaded. After a real build,
  confirm the packaged `.so` has no `.debug_info`
  (`llvm-readelf -S libroutevn_exporter_jni.so`) and the same build ID as the
  archived one (`llvm-readelf -n`).
- **iOS:** keep the release `.xcarchive`; its `dSYMs/` folder matches the
  shipped build.

The uploader writes `javascript` plus `cocoa` (iOS), or `javascript`, `java`,
and `native` (Android) manifests to match the event platforms.

Install `routevn-symbols` from the observability repository and set
`ROUTEVN_SYMBOLS_AWS_PROFILE`. Android's `bundleRelease`/`assembleRelease`
finalizer invokes the uploader. For iOS, run
`ROUTEVN_CRASH_SYMBOLS=1 bun run build:ios`, archive as shown in
[iOS release instructions](ios.md), then run
`bash scripts/upload-crash-symbols.sh ios` before export. By default the
uploader prints a plan; set `ROUTEVN_SYMBOLS_UPLOAD=1` to upload, with failures
stopping the release. `.artifacts/` is local and ignored by git.

## Store disclosures

Before shipping, declare crash data in the App Store privacy labels
(Diagnostics → Crash Data) and in the Google Play Data safety form (App info
and performance → Crash logs). No identifiers are collected.

## Verification

Each platform must be qualified against the collector before it is claimed as
supported: a real crash in a release-configured build, delivery after relaunch,
and a check that the stored row contains only the fields listed above.

- Android: run `python3 scripts/dev.py` in `routevn-api-2`, then
  `adb reverse tcp:3000 tcp:3000` and install a debug build with
  `-ProutevnSentryDsn=<local dsn>`. Induce a JVM crash with
  `adb shell am crash com.routevn.creator` and a native crash with
  `adb shell run-as com.routevn.creator kill -SEGV <pid>`, then relaunch.
- iOS: a physical device cannot reach the local collector on `127.0.0.1`.
  Expose the test collector on the Mac's LAN address, pass that test DSN to a
  Debug build, and allow Local Network access on the device. Relaunch after the
  crash to deliver the saved report. Production HTTPS reporting does not need
  this local-network test setup.

iOS build configuration verified on 2026-09-29: an unsigned Release device build
contains the production DSN and environment in its processed `Info.plist`; an
isolated Release build with an empty DSN fails in `Configure crash reporting`.
A signed Debug build has an empty DSN and was installed and launched on the
physical iPad. The six configuration regression tests cover missing files,
invalid values, Debug overrides and incremental-build changes. These checks do
not replace a Release crash-delivery test.
