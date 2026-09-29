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

WebView JavaScript errors are separate: `appService.reportError` is a no-op on
Android and iOS.

### Android WebView renderer loss

Android kills the WebView renderer under memory pressure, and the renderer can
also crash. Left unhandled, Chromium aborts the app with a `SIGTRAP` whose
report only shows WebView internals. `MainActivity` handles
`onRenderProcessGone` by destroying the dead WebView and crashing the app with
`MainActivity$WebViewRendererKilledException` (memory kill) or
`MainActivity$WebViewRendererCrashedException`. The user sees the app close,
as before, and the report names the cause. iOS WebView content process
termination is not handled yet.

Native crash reports are saved locally and delivery is attempted on a later
launch. Delivery is best effort: storage failures, cache eviction and rejected
requests can discard reports. Reports are not guaranteed to remain until the
collector accepts them. A user who never reopens the app may produce no report.
There is no crash-free-rate metric because sessions are disabled.

## Resource and startup safeguards

- Android initializes reporting once on a background thread. SDK cache-flush
  and native-library waits do not block `Application.onCreate`. Recoverable
  initialization errors, including worker creation/start failures, disable
  reporting for that launch; there is no retry loop. Fatal VM errors such as
  out-of-memory are not swallowed. Crashes before the background initializer
  finishes may be missed.
- Android's normal envelope cache and transport queue are each limited to ten
  entries. Connection and read timeouts are five seconds each, and the event
  flush timeout is one second. These are separate limits, not an overall
  deadline or a disk-byte quota.
- iOS's envelope cache is limited to ten entries. The SDK also limits its raw
  crash store separately. Logs, metrics and attachments are explicitly disabled
  on both platforms, alongside the other disabled features listed above.
- No application-owned event history or automatic app restart is maintained.

Known SDK gaps remain with the published versions above: Android's native
outbox is separate from its bounded envelope cache, has no enforced retention
limit, and reads envelopes into memory before parsing. Cocoa may synchronously
flush a startup crash for up to five seconds. Fixes must be released upstream
before this app can enable outbox byte/age limits and asynchronous iOS startup
crash delivery; changing `maxCacheItems` alone does not fix those paths.

The collector's 256 KiB request limit does not limit local disk use or memory
allocated before sending. These safeguards do not establish a hard quota over
all SDK files or prove the absence of SDK memory leaks.

## Configuration

| Build   | Android                                                                                                                                                                  | iOS                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release | `app/build.gradle.kts` reads `ROUTEVN_SENTRY_DSN` from `.env.production` into `BuildConfig.SENTRY_DSN`; environment `production`. Missing, empty or malformed DSNs and non-HTTPS Release DSNs fail the build. | `Configure crash reporting` reads `ROUTEVN_SENTRY_DSN` from `.env.production`; environment `production`. Missing, empty or invalid HTTPS DSNs fail the build. |
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
# Requires JAVA_HOME (JDK 17) and ANDROID_HOME:
python3 tests/android/crashReportingConfiguration.py
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
device state, frame variables and source context, and absolute paths. Filtering
debug images reduces report size but does not guarantee the collector's 256 KiB
event limit; larger reports are rejected, not truncated.

The collector's server-side redaction only removes fixed structural fields, so
the client scrubbing is required.

## Symbols

The collector does not decode stacks and has no symbol upload API. Keep each
release's symbol files so reports can be decoded manually:

- **Android:** release builds keep line numbers
  (`-keepattributes SourceFile,LineNumberTable`) and native symbol tables
  (`debugSymbolLevel = "SYMBOL_TABLE"`). `bundleRelease`/`assembleRelease` copy
  `mapping.txt` and `native-debug-symbols.zip` to
  `.artifacts/android-crash-symbols/<versionName>-<versionCode>/`. Decode JVM
  stacks with R8 `retrace` and native frames with `llvm-symbolizer`.
- **iOS:** keep the release `.xcarchive`; its `dSYMs/` folder matches the
  shipped build. Decode frames with `atos`.

`.artifacts/` is local and ignored by git. Copy each release's symbols to
durable storage before cleaning it.

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
