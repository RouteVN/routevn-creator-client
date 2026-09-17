# Mobile Dependency Survey

Checked on 2026-09-17 against Google Maven, npm, crates.io, and upstream release
notes. Scope: native Android/iOS shells, Android's JNI exporter, and JavaScript
compatibility libraries used by mobile. This is not an audit of every shared
frontend or desktop dependency.

## Applied Updates

| Dependency | Before | After | Reason |
| --- | --- | --- | --- |
| AndroidX Fragment | 1.0.0 | 1.9.0 | Replace the outdated SDK reported by Google Play. |
| AndroidX WebKit | 1.16.0 | 1.17.0 | Current stable WebView integration library; existing bridge APIs compile unchanged. |
| Play Services Basement | 18.1.0 | 18.11.0 | Published stability, crash, and exception-handling fixes. |
| Play Services Tasks | 18.0.2 | 18.4.1 | Current stable task runtime for In-App Updates. |
| Play Core Common | 2.0.3 | 2.0.4 | Published patch release for the common Play runtime. |
| Android Gradle Plugin | 9.2.0 | 9.2.1 | Patch fixes an R8 `RecordTag` class-not-found failure. |
| OGG Opus decoder | 1.7.3 | 1.7.5 | Fix constructor properties affected by minification; used by the older-iOS audio fallback and graphics runtime. |

Fragment and the three Play runtime dependencies use ordinary Gradle constraints
on published artifacts. They are transitive dependencies of In-App Updates;
constraints do not introduce them if their parent dependency is removed. Even
Basement 18.11.0 requests Fragment 1.1.0, so the Fragment constraint is still needed.
No dependency source or cached bundles are patched.

Sources: [Fragment](https://developer.android.com/jetpack/androidx/releases/fragment),
[WebKit](https://developer.android.com/jetpack/androidx/releases/webkit),
[Play Services releases](https://developers.google.com/android/guides/releases),
[Play Services Tasks metadata](https://dl.google.com/dl/android/maven2/com/google/android/gms/play-services-tasks/maven-metadata.xml),
[Play Core Common metadata](https://dl.google.com/dl/android/maven2/com/google/android/play/core-common/maven-metadata.xml),
[AGP 9.2.1](https://developer.android.com/build/releases/agp-9-2-0-release-notes),
[Opus decoder release](https://github.com/eshaz/wasm-audio-decoders/releases/tag/ogg-opus-decoder/1.7.5).

## Already Current

- AndroidX Core Splashscreen `1.2.0` and Play In-App Updates `2.1.0` are the
  newest stable releases in their respective Google Maven metadata.
- `construct-style-sheets-polyfill` `3.1.0`, `@noble/hashes` `2.4.0`, and
  `@wasm-audio-decoders/ogg-vorbis` `0.1.20` match npm's latest releases.
- The iOS Xcode project has no Swift Package Manager or CocoaPods dependencies.
  It imports Apple frameworks (including WebKit, UIKit, AVFoundation, PhotosUI,
  and CryptoKit) and links the system SQLite library. These have no independent
  application package version to bump. The local build tool is Xcode 27.0;
  deployment remains iOS 16.0.

Sources: [Splashscreen releases](https://developer.android.com/jetpack/androidx/releases/core#core-splashscreen),
[In-App Updates releases](https://developer.android.com/reference/com/google/android/play/core/release-notes-in_app_updates),
and npm registry metadata for the named JavaScript packages.

## Deferred Candidates

These remain older than the newest stable releases. They are not represented as
fully updated by this change.

### AndroidX Transitive Dependencies

| Family | Resolved after this change | Latest stable found |
| --- | --- | --- |
| Core / Core KTX | 1.10.0 | 1.19.0 |
| Activity | 1.8.1 | 1.13.0 |
| Lifecycle | 2.6.1 | 2.11.0 |
| SavedState | 1.2.1 | 1.5.0 |
| AppCompat resources | 1.7.0 | 1.8.0 |
| Loader | 1.0.0 | 1.2.0 |
| ViewPager | 1.0.0 | 1.1.0 |
| CustomView | 1.0.0 | 1.2.0 |
| ProfileInstaller | 1.4.0 | 1.4.1 |
| Startup | 1.1.1 | 1.2.0 |
| VectorDrawable | 1.1.0 | 1.2.0 |

Versions were checked against each artifact's Google Maven `maven-metadata.xml`.
Retain the upstream-selected graph for these families for now. Updating the
Activity/Lifecycle/SavedState stack deserves a coordinated compatibility pass,
including back navigation, restoration, and old-device startup. The native shell
extends platform `Activity`, so adding a newer Activity library alone would not
migrate its existing back-navigation code. The smaller transitive patch updates
can be included in that pass; they are not needed for the reported Fragment SDK
warning. Physical Android verification is currently blocked by signing.

### Android Rust Exporter

| Crate | Android lockfile | Latest stable found |
| --- | --- | --- |
| jni | 0.21.1 | 0.22.4 |
| image | 0.25.6 | 0.25.10 |
| serde | 1.0.228 | 1.0.229 |
| serde_json | 1.0.150 | 1.0.151 |
| sha2 | 0.10.9 | 0.11.0 |
| sprite_dicing | 0.1.4 | 1.0.0 |
| zip | 0.6.6 | 8.6.0 |

Versions were checked through the crates.io API. JNI, hashing, dicing, and ZIP
updates cross semver compatibility boundaries. `image` is explicitly pinned and
newer releases change image conversion/codec behavior. The exporter is also used
by desktop builds: handle these together with the shared exporter lockfiles,
PNG/JPEG/WebP atlas and ZIP round-trip tests, and JNI smoke tests on all supported
Android ABIs. Serde patch refreshes can accompany that focused maintenance pass.

### Build Tools

AGP `9.4.0` is available, but this change takes the corrective `9.2.1` patch and
retains its documented Gradle `9.4.1` pairing. A newer AGP/Gradle pair should be
validated together in CI. Android SDK/NDK pins and the iOS deployment target are
unchanged; changing supported OS versions is outside a library refresh.

## Validation

- Android debug and Google Play release APK builds passed, including R8 shrinking
  and the existing native build for all four Android ABIs. These native builds
  used the existing packaged frontend assets; they are not new publication bundles.
- Release dependency resolution confirms the new WebKit, Fragment, and Play pins.
- 44 targeted tests passed across Android updates, mobile update setup, real OGG
  decoding, and iOS graphics audio output.
- A separate Vite-minified, Safari-16-targeted audio bundle decoded real Opus and
  Vorbis fixtures in both Chromium and WebKit: two seconds, stereo, 48 kHz,
  non-silent output. This verifies decoding, not audible playback on a phone.
- Android lint still reports seven errors in unchanged back-navigation and theme
  code. WebKit 1.17 also exposes an existing missing renderer-crash callback via
  its new `MissingOnRenderProcessGone` warning; no suppression was added.
- Android device installation is pending because the installed app has a
  different signing certificate. The existing installation/data were preserved.
- `ios:refresh` could not refresh a device because no iOS dev server was running.
