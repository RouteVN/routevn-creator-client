# Iteration 13 - Android Storage And Checkpoints

## Question

Can Android storage/checkpoint work block the JS thread during autosave?

## Evidence

- Android SQLite `select` calls `callAndroidBridge("sqliteQuery", ...)` at `src/deps/clients/android/sqlite.js:92`.
- Android SQLite `execute` calls `callAndroidBridge("sqliteExec", ...)` at `src/deps/clients/android/sqlite.js:118`.
- `callAndroidBridge` synchronously calls `window.RouteVNAndroid[method]` with a JSON string and parses the JSON result at `src/deps/clients/android/bridge.js:26`.
- Android collab store is configured with WAL and `synchronous: "FULL"` at `src/deps/services/android/collabClientStore.js:178` through `:188`.
- `insertDrafts` serializes writes through a queue and loops `store.insertDraft(item)` for each item at `src/deps/services/android/collabClientStore.js:227` through `:234`.
- Local-only submit maps commands to local draft events, then calls `insertDraft` or `insertDrafts` at `src/deps/services/android/projectServiceAdapters.js:196` through `:210`.
- Command submission clones commands, submits them, applies them to repository state, then flushes the main checkpoint best-effort at `src/deps/services/shared/commandApi/shared.js:287` through `:300`.
- Repository runtime add-events refreshes main state, updates active scene projection, updates scene bundle runtime, and notifies listeners at `src/deps/services/shared/projectRepositoryRuntime.js:1304` through `:1337`.
- Main checkpoint flush saves current main projection state at `src/deps/services/shared/projectRepositoryRuntime.js:638` through `:647`.
- Android checkpoint saving loads history stats before writing checkpoint metadata at `src/deps/services/android/collabClientStore.js:316` through `:330`.

## Finding

On Android, repository persistence can block JS even though the APIs are `async`, because the bridge calls are synchronous JavaScript-to-native calls with JSON serialization/parsing. Autosave therefore has both CPU and bridge/storage risks:

- full-section command diff on JS,
- command cloning,
- local draft insert(s),
- repository apply/projection refresh,
- checkpoint serialization,
- SQLite query/exec through synchronous native bridge,
- extra history-stat queries during checkpoint save.

This reinforces that the first optimization should reduce how often autosave and runtime projection are forced by raw typing. A later storage optimization may still be needed if measurements show periodic save stalls.

## Optimization Hypothesis

- Measure bridge call count, max duration, total duration, payload sizes, and checkpoint duration during a draft flush.
- Batch Android `insertDrafts` through a native transaction/bulk bridge call if many commands are generated.
- Avoid flushing main checkpoint on every autosave if local draft persistence already protects data and checkpoint can be coalesced.
- Avoid `syncStoreProjectState` inside a loop over dirty sections where possible.
- Prefer one-line update commands for ordinary typing once dirty-line tracking exists.

## Confidence

Medium-high. The blocking bridge shape is clear, but the actual stall depends on Android device, project size, and generated command count.

## Next Question

What is the final prioritized diagnosis and action plan?
