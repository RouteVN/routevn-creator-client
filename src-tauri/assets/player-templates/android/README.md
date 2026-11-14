# Android Player Template

Place the release-built unsigned Android player templates and their matching
validated descriptors here:

```text
RouteVNPlayerTemplate.apk
RouteVNPlayerTemplate.json
RouteVNPlayerTemplate.aab
RouteVNPlayerTemplate.aab.json
```

The APK template is used for APK export and the Android App Bundle template
for App Bundle export.

Build and validate them with:

```bash
bun run player-template:build:android
```

The build stages the standalone player and Android persistence host, builds
`routevn_player` for arm64-v8a, armeabi-v7a, x86, and x86_64, and builds the
APK and the App Bundle of `android/player` in release mode without signing. The
template descriptor CLI validates each unsigned template, records its icon and
color slots, and hashes it before any artifact is copied here.

The build host needs JDK 17, Android SDK 37 and Build Tools 37.0.0, NDK
29.0.14206865, Cargo, and the four Android Rust targets. SDK and NDK discovery
uses ANDROID_HOME, ANDROID_SDK_ROOT, ANDROID_NDK_HOME, ANDROID_NDK_ROOT, or
local.properties, matching the Android development build. JAVA_HOME is passed
through to Gradle.

To stage only the frontend, without running Cargo or Gradle:

```bash
bun run player-template:prepare:android
```

The templates and descriptors are built locally and committed as regular Git
artifacts. Rebuild all four together after player changes. End users consume
these templates; export never runs the Android build toolchain. The templates
contain no game package until export and reserve
`vn.routevn.androidplayer.template` as their application ID.
