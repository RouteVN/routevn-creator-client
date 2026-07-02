# Android JNI Exporter Spike

Temporary working note for validating Android support for the Rust distribution
ZIP exporter and image dicing optimizer.

## Goal

Reuse the Rust exporter on Android so Android distribution ZIPs get the same
bundle v4 image optimization as desktop/Tauri exports.

## Current State

- Desktop/Tauri calls `create_distribution_zip_streamed` from
  `src-tauri/src/export_zip.rs`.
- The Rust exporter reads asset file paths, writes `package.bin`, applies
  sprite dicing for eligible PNG/JPEG/WebP assets, writes atlases, and returns
  export stats.
- Android currently builds distribution ZIPs in JS with `createBundleResult`
  and `JSZip`, so assets stay raw and image dicing is skipped.
- The current Android app is a custom Java WebView shell, not a Tauri mobile
  shell, so it cannot directly call Tauri `invoke` commands.

## Preferred Architecture

Android export path:

```text
JS page/service
-> Java bridge
-> JNI Rust exporter
-> temp ZIP file in app storage
-> Java copies temp ZIP to selected SAF URI
```

Rust should operate only on normal filesystem paths. Java should remain
responsible for Android `content://` / SAF writes.

## Validation Order

1. Confirm Android Rust target and NDK can build the relevant dependencies.
2. Confirm a small Rust `cdylib` can build for `arm64-v8a`.
3. Confirm Gradle packages and loads the `.so`.
4. Confirm Java can call a JNI smoke method on the attached device.
5. Extract exporter logic only after the native boundary is proven.
6. Replace Android JS ZIP export only after the Rust exporter works on-device.

## Implementation Cut

1. Extract pure exporter code into a shared Rust crate.
2. Keep Tauri command as a thin wrapper over that crate.
3. Add Android JNI wrapper crate with a single JSON-in/JSON-out method.
4. Add Gradle task/script to build and package the Rust `.so`.
5. Add Java bridge method for optimized distribution export.
6. Change Android project service adapter to request native optimized export.
7. Keep JS ZIP export as fallback until device validation is complete.

## Risk Checks

- Android Rust target availability.
- NDK linker configuration.
- `image` and `sprite_dicing` Android compile compatibility.
- JNI method naming and Java package stability.
- APK packaging of `libroutevn_exporter_jni.so`.
- Runtime loading via `System.loadLibrary`.
- Exporting to temp file then copying to SAF URI.
- Memory usage on large projects.
- Output parity with desktop bundle manifest/stats.

## Validation Results

- Installed `aarch64-linux-android` with `rustup target add`.
- Confirmed the current Rust dependency graph compiles for Android when Cargo
  is given the NDK API 24 clang linker.
- Added a minimal JNI `cdylib` crate and Android Rust build script.
- Confirmed Gradle packages the generated `arm64-v8a` `.so`.
- Installed and launched the Android debug APK on the attached device.
- Confirmed Java can load and call the Rust JNI library on-device through
  logcat:
  `Native exporter JNI smoke: {"ok":true,"message":"routevn-exporter-jni"}`.
- Extracted the exporter into a pure `routevn-exporter` Rust crate.
- Confirmed exporter tests pass after extraction, including PNG/JPEG/WebP
  dicing tests and oversized image fallback.
- Confirmed the Tauri command wrapper compiles against the extracted crate.
- Confirmed the Android JNI crate builds and runs on-device while linked to the
  extracted exporter crate:
  `Native exporter JNI smoke: {"ok":true,"message":"routevn-exporter-jni","bundleVersion":4}`.
- Added the real JNI JSON-in/JSON-out export method and confirmed the JNI crate
  checks on the host target.
- Added the Java bridge endpoint that resolves Android project files to normal
  app-storage paths, calls Rust into a temp ZIP, and copies the result to the
  selected SAF URI.
- Switched the Android selected-path export flow to native optimized export
  with the previous JS ZIP implementation retained as fallback.
- Added a debug-only startup ZIP smoke that calls the real exporter through
  JNI, writes a ZIP from generated PNG assets in cache, logs stats, and deletes
  the temp files.
- Confirmed `cargo test --manifest-path crates/routevn-exporter/Cargo.toml`
  still passes.
- Confirmed `cargo check --manifest-path src-tauri/Cargo.toml` still passes.
- Confirmed `bash scripts/build-android-rust.sh` builds the Android
  `arm64-v8a` `.so`.
- Confirmed `./gradlew :app:compileDebugJavaWithJavac` passes.
- Reinstalled the Android debug APK on the attached device and confirmed the
  debug startup smoke can run the real exporter through JNI with generated PNG
  asset file paths:
  `Native exporter ZIP smoke: {"rawAssetBytes":358698,"assetCount":2,"packageBinBytes":160477,"zipBytes":153895,"uniqueChunkCount":2,"chunkReferenceCount":2,"storedChunkBytes":152190,"dedupedBytes":206510,"dicedAssetCount":2,"atlasCount":1,"imageOptimizedBytesSaved":199035}`.
- Confirmed the debug startup ZIP smoke is gated to once per APK install; a
  second app launch did not repeat the native ZIP smoke.
- Validated the full Android export bridge with a real project on the attached
  device by completing the app save-picker callback and letting the normal
  export handler continue.
- Confirmed the selected-path export flow called
  `createDistributionZipStreamedToUri`, wrote a native ZIP in app cache, copied
  it to the requested URI, and returned native exporter stats.
- Pulled the exported ZIP from device cache and confirmed it contains
  `package.bin`, `index.html`, and `main.js`.
- Parsed the exported `package.bin` and confirmed bundle format version `4`,
  `45` manifest assets, `37` raw assets, `8` diced-image assets, `1` atlas, and
  sprite-dicing metadata.
- Measured the native JNI export itself at about `4.0s` for the tested project.
  The much larger observed delay happens before the JNI call, during JS-side
  repository/version/export preparation.

## Remaining Work

The JNI exporter path is functional. The next performance target is the
pre-native export preparation:

1. Measure `loadRepositoryState(version.actionIndex)` and the projection/filter
   work before native export is called.
2. Avoid rebuilding or replaying full repository state where a current
   checkpoint/snapshot can be reused.
3. Move the native export endpoint to the same request-id async pattern used by
   Android project folder export if the JNI call itself becomes visible UI
   blocking on larger projects.
