# Android Player Template

Place the release-built unsigned Android player template and its matching
validated descriptor here:

```text
RouteVNPlayerTemplate.apk
RouteVNPlayerTemplate.json
```

Build and validate them with:

```bash
bun run player-template:build:android
```

The build stages the standalone player and Android persistence host, builds
`routevn_player` for arm64-v8a, armeabi-v7a, x86, and x86_64, and assembles
`android/player` in release mode without signing. The template descriptor CLI
validates the unsigned APK, records icon and color slots, and hashes the APK
before either artifact is copied here.

The build host needs JDK 17, Android SDK 37 and Build Tools 37.0.0, NDK
29.0.14206865, Cargo, and the four Android Rust targets. SDK and NDK discovery
uses ANDROID_HOME, ANDROID_SDK_ROOT, ANDROID_NDK_HOME, ANDROID_NDK_ROOT, or
local.properties, matching the Android development build. JAVA_HOME is passed
through to Gradle.

To stage only the frontend, without running Cargo or Gradle:

```bash
bun run player-template:prepare:android
```

The APK and descriptor are built locally and committed as regular Git artifacts.
Rebuild both together after player changes. End users consume this template;
export never runs the Android build toolchain. The template contains no game
package until export and reserves `vn.routevn.androidplayer.template` as its
application ID. Exported APKs must be signed with the game's own key before
installation or distribution.
