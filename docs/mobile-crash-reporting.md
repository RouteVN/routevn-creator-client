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

Android also reports WebView renderer crashes that the app recovers from, at
level `error` (see [WebView renderer loss](#webview-renderer-loss)).

Crash reporting only. Sessions, ANRs/app hangs, watchdog terminations,
breadcrumbs, screenshots, view hierarchies, swizzling, network tracking,
performance tracing, client reports and replay are disabled. The aggregate
`sentry-android` artifact is not used because it also ships replay.

## Crash ID

Every crash or error report carries `user.id`: a random UUID v4 generated once
per install and persisted by the native shell before Sentry initializes, so
startup crashes carry it too. The backend keeps only `user.id` from each
event, which allows counting distinct crashing installs per version
(crash-free users) even though sessions are disabled.

- Android: `crashId` in the `routevn_crash_reporting` SharedPreferences.
- iOS: `RouteVNCrashId` in UserDefaults.
- Desktop: a `crash-id` file in the app data directory. Instances that start
  together create or repair it one at a time under an OS lock on the empty
  `crash-id.lock` beside it.

The ID is random and resets when app storage is cleared or the app is
reinstalled on Android and iOS; restoring an iOS backup can bring the old ID
back. On macOS, Windows, and Linux, the desktop file lives in the app data
directory and survives deleting the app unless that directory is removed.
The ID is separate from the update-check device ID (`device.id`), is never
sent with update checks or anywhere else, and the two cannot be derived from
each other. It links to no account and no other data. A stored value that is
not a valid ID, including one of another type, a desktop file that is not a
small regular file, or bytes that are not UTF-8, is replaced with a fresh ID.
If the shell cannot read or write its storage, a random ID is generated in
memory for that run instead; the ID never blocks or crashes startup. On iOS,
UserDefaults saves
asynchronously, so a crash within seconds of the very first launch may produce
one additional ID on the next launch.

On desktop, the JS reporter receives the same ID with the configuration the
Tauri core injects before any page script runs, and sends it as `user.id`.
WebView JavaScript errors are not reported on Android and iOS
(`appService.reportError` is a no-op there). Plain web builds send no
`user.id`.

### WebView renderer loss

The app's interface runs in a WebView whose page runs in a separate process:
the Chromium renderer on Android, the WebKit content process on iOS. The system
can kill that process to reclaim memory, and it can crash, while the app
process keeps running. Left unhandled on Android, Chromium then aborts the app
with a `SIGTRAP` whose report only shows WebView internals; on iOS the page goes
blank. Following
[Android's guidance](https://developer.android.com/develop/ui/views/layout/webapps/handle-termination),
both apps recover by loading the app again instead of closing:

| Case                                                                                                        | What the user sees                                                                           | Reported                                                        |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Android: renderer killed by the system (`didCrash() == false`)                                              | The app loads again at its start page. In the background, loading waits until it is resumed. | Nothing                                                         |
| Android: renderer crashed (`didCrash() == true`)                                                            | The same reload                                                                              | `MainActivity$WebViewRendererCrashedException` at level `error` |
| iOS: content process ended (`webViewWebContentProcessDidTerminate`); WebKit does not say whether it crashed | The same reload; in the background it waits until the app is active                          | Nothing                                                         |
| The process is lost again within 30 seconds of the page loading, twice in a row                             | The app closes                                                                               | A crash at level `fatal` (below)                                |

Memory kills are not reported on either platform. They are normal system
behaviour, most often while the app is in the background, and there is nothing
in them to fix. This matches the mainstream tools, which record memory
terminations separately from crashes and only while the app is in use (Sentry's
iOS watchdog terminations, which are disabled here). A renderer crash is
reported because it is a real failure, at level `error` because the app kept
running. The crash reporter sets `fatal` on crashes that close the app, so in
obs the level, or the exception type, separates recovered renderer crashes from
crashes. The event passes through the same `beforeSend` scrubbing as a crash,
so it carries only the exception type, stack, release, device, OS and crash ID.

Recovery on Android (`MainActivity.onRenderProcessGone`, which always returns
`true`):

1. Remove and destroy the dead WebView. It is never reused.
2. Reset the native state that only the dead page could have finished, as a
   fresh launch would. On the bridge thread, so it runs before any call from the
   new page: roll back its open SQL transactions by ending them without marking
   them successful (closing the connection would not: Android keeps it, and
   its write lock, until the transaction ends); abandon unfinished project file writes; and delete
   partially saved documents. Replies to calls from the dead page are dropped.
   Native project exports and open pickers carry on; their results go to the
   new page, which ignores results it did not request.
3. Create a new WebView exactly as at startup and load the start page, at once
   if the activity is resumed, otherwise in `onResume`.

Recovery on iOS (`RouteVNViewController.webViewWebContentProcessDidTerminate`):
WebKit keeps the `WKWebView` usable, so the controller rolls back any open SQL
transaction and closes its SQLite handles on the main thread, where page SQL
runs, then loads the start page again, at once if the app is active, otherwise
when it next becomes active.

A loss within 30 seconds of the page starting to load counts as rapid. After two
rapid losses in a row the app stops reloading, so a page that cannot start does
not loop: Android throws `MainActivity$WebViewRendererKilledException` or
`MainActivity$WebViewRendererCrashedException` from the main looper, and iOS
calls `fatalError` in `webViewWebContentProcessDidTerminate`. Both reach the
crash reporter as ordinary `fatal` crashes.

Anything unsaved on the page is lost, as in a crash, and an edit whose SQL
transaction had not committed is rolled back. Saved project data is not
affected. On Android 7 the WebView runs inside the app's process, so a renderer
crash there is a native app crash and cannot be recovered.

Native crash reports are saved locally and delivery is attempted on a later
launch. Delivery is best effort: storage failures, cache eviction and rejected
requests can discard reports. Reports are not guaranteed to remain until the
collector accepts them. A user who never reopens the app may produce no report.
There is no crash-free-rate (session) metric because sessions are disabled;
distinct crashing installs per version are counted from the [crash
ID](#crash-id) instead.

## Resource and startup safeguards

- Android initializes reporting once on a background thread. SDK cache-flush
  and native-library waits do not block `Application.onCreate`. Recoverable
  initialization errors, including worker creation/start failures, disable
  reporting for that launch; there is no retry loop. Fatal VM errors such as
  out-of-memory are not swallowed. Crashes before the background initializer
  finishes may be missed.
- Android's normal envelope cache and transport queue are each limited to ten
  entries. Connection and read timeouts are five seconds each. The flush
  timeout stays at the SDK default of 15 seconds: a crash is stored by the same
  single transport thread that may be sending a cached report, so a shorter
  wait can drop the new crash while the app is exiting. These are separate
  limits, not an overall deadline or a disk-byte quota.
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

| Build   | Android                                                                                                                                                                                                       | iOS                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release | `app/build.gradle.kts` reads `ROUTEVN_SENTRY_DSN` from `.env.production` into `BuildConfig.SENTRY_DSN`; environment `production`. Missing, empty or malformed DSNs and non-HTTPS Release DSNs fail the build. | `Configure crash reporting` reads `ROUTEVN_SENTRY_DSN` from `.env.production`; environment `production`. Missing, empty or invalid HTTPS DSNs fail the build. |
| Debug   | No DSN, so nothing is reported. Pass `-ProutevnSentryDsn=<dsn>` to report to a collector; environment `development`.                                                                                          | `ROUTEVN_SENTRY_DSN` is empty. Pass `ROUTEVN_SENTRY_DSN=<dsn>` to `xcodebuild` to report; environment `development`.                                          |

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
iOS `CFBundleVersion`, or on Android `<versionCode>-<distribution>` (`direct` or
`google-play`): each distribution runs R8 separately, so its symbols need their
own `dist`.

## Collection and privacy

`beforeSend` on each platform (`NativeCrashScrubber`) keeps:

- exception type, mechanism type and handled flag, and signal/Mach metadata
- stack frames: function, module, file basename, line, instruction and image
  addresses
- debug images that the frames point into, with file paths reduced to basenames
  but debug IDs, load addresses and sizes kept
- app release and dist, device model and architecture, OS name and version
- the install [crash ID](#crash-id) as `user.id` (the only user field kept;
  email, username, IP address, segment and any other user data are dropped)

It drops message and exception text (replaced with `App crash`), every other
user field, request, tags, extras, breadcrumbs, server name, modules, device
name and other device state, frame variables and source context, and absolute
paths. Filtering debug images reduces report size but does not guarantee the
collector's 256 KiB event limit; larger reports are rejected, not truncated.

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
  - Pass `-ProutevnProguardUuid=<uuid>` (lowercase) to tag that build's JVM
    crashes with a ProGuard debug image, and keep the build's `mapping.txt`
    under the same UUID. Builds without it send no ProGuard image.
  - `scripts/build-android-rust.sh` links `libroutevn_exporter_jni.so` with a
    GNU build ID and line tables. Packaging strips the shipped copy; the
    unstripped `.artifacts/android-rust/<target>/release/` copy has the same
    build ID, so it is the symbol file for native frames in that library.
- **iOS:** keep the release `.xcarchive`; its `dSYMs/` folder matches the
  shipped build. Decode frames with `atos`.

`.artifacts/` is local and ignored by git. Copy each release's symbols to
durable storage before cleaning it.

## Store disclosures

Before shipping, declare:

- App Store privacy labels: Diagnostics → Crash Data, and Identifiers →
  Device ID (the [crash ID](#crash-id); not linked to the user's identity, not
  used for tracking), purposes App Functionality and Analytics.
- Google Play Data safety form: App info and performance → Crash logs, and
  Device or other IDs, purpose Analytics, not shared, not used for tracking.

## Test crashes

Release builds have no debugger, and `adb` cannot signal a non-debuggable app,
so the apps crash on purpose when a project is created with one of these names.
The project is not created. On desktop, these names can be submitted without a
project location:

| Project name                 | Android                                                                                                                   | iOS                                            | Desktop                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ROUTEVN_TEST_PANIC_CRASH`   | Rust panic in `libroutevn_exporter_jni.so`, which aborts (`SIGABRT`)                                                      | Swift `fatalError`                             | Rust panic in the `trigger_test_crash` command, reported at level `fatal`; the app then exits |
| `ROUTEVN_TEST_NATIVE_CRASH`  | Invalid memory write in `libroutevn_exporter_jni.so` (`SIGSEGV`)                                                          | Invalid memory write (`EXC_BAD_ACCESS`)        | Not available; the project is created normally                                                |
| `ROUTEVN_TEST_APP_CRASH`     | Uncaught `MainActivity$TestCrashException` on the main thread                                                             | Uncaught `NSException` (`RouteVNTestCrash`)    | Uncaught webview error (`RouteVNTestCrash`), reported at level `error`; the app keeps running |
| `ROUTEVN_TEST_WEBVIEW_CRASH` | WebView renderer crash (`chrome://crash`); the app reloads and reports `WebViewRendererCrashedException` at level `error` | Not available; the project is created normally | Not available; the project is created normally                                                |

Reopen the mobile app after a native crash so the saved report is sent.
Desktop sends each report before the app exits or carries on, so it needs no
relaunch. These are real reports, so use them only when testing. In production
they are told apart by exception type (`MainActivity$TestCrashException`,
`RouteVNTestCrash`) or, for native crashes and panics, by the `nativeTestCrash`
frame on Android, the `triggerTestCrash` frame on iOS and the
`trigger_test_crash` frame on desktop. Desktop does not report native crashes
or webview renderer crashes (see
[desktop error reporting](desktop-error-reporting.md)). Web, and an app shell
too old to know the names, create such projects normally. On Android 7 the
WebView runs in the app's process, so `ROUTEVN_TEST_WEBVIEW_CRASH` crashes the
app natively instead. The names are listed in `src/internal/testCrashes.js`.

## Verification

Each platform must be qualified against the collector before it is claimed as
supported: a real crash in a release-configured build, delivery after relaunch,
and a check that the stored row contains only the fields listed above. Use the
[test crash names](#test-crashes) to crash a release build.

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

Android crash delivery verified on 2026-09-29 on a Redmi K30 5G (Android 12)
with the background initializer: a Debug build using the development DSN
`http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1`, sending
through `adb reverse` to a local envelope sink rather than `routevn-api-2`.
A JVM crash (`am crash`, surfacing as the WebView renderer-loss exception) was
delivered to `/system/sentry/api/1/envelope/` while the process exited; a
`kill -SEGV` native crash was delivered after relaunch. Both events contained
only release, dist, environment, level, platform, SDK, fingerprint, the scrubbed
exception (`App crash`), frames, device architecture/manufacturer/model, OS
name/version and, for the native crash, basename-only debug images. This does
not replace the Release-build qualification against the collector.
