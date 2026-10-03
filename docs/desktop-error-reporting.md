# Desktop error reporting

Android and iOS native crashes are covered in
[mobile crash reporting](mobile-crash-reporting.md).

The Tauri desktop app sends uncaught webview errors, unhandled promise
rejections, and Rust panics to the Sentry-compatible collector in
`routevn-api-2`. Browser and Rust use separate official SDKs and their normal
transports. Neither layer forwards failures through the other. Handled errors
stay in their existing UI flows.

## Build configuration

One variable, `ROUTEVN_SENTRY_DSN`, configures both SDKs:

- Development uses the local API DSN by default, with no env file required:
  `http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1`.
  Export `ROUTEVN_SENTRY_DSN` in the shell that runs the Tauri development build
  to use another local port. Development builds do not read `.env`.
- `.env.production`: the production API DSN, used by `tauri:build`, platform
  release scripts, and Steam release builds.

`src-tauri/build.rs` selects this configuration automatically using Tauri's build
mode. The same selection applies to every desktop build entry point, including
the Linux Docker build. A Tauri development run with the release profile still
uses the development default. For production, edit `.env.production` and
rebuild; Cargo watches it for changes. That file is authoritative for release
builds, so an inherited value from `.env` or the shell cannot override it.

Only `.env.production` is checked in for collector configuration; its DSN is
public routing data. Keep signing keys and other secrets in the ignored `.env`.
A missing production file or missing/empty production DSN fails the build.

Tauri injects the compiled DSN into the webview before application scripts run,
along with the release, build ID, and environment label. The injected object is
read-only. Both official SDKs receive the same configuration.

Use the development DSN printed by `python3 scripts/dev.py` in `routevn-api-2`.
Development builds reject DSNs outside HTTP on `127.0.0.1`, the only local host
the webview CSP allows, so loading production settings by mistake cannot send
development errors there. Every build parses the DSN with the Sentry DSN parser
and fails on an invalid value instead of shipping an app that panics at startup.
Production builds also require an HTTPS DSN.

The key is public SDK routing data; it is never a RouteVN bearer credential.
Do not add RouteVN authentication headers, cookies, or RPC tokens to SDK
transport requests. Passing configuration to the webview does not forward
webview errors through Rust; each official SDK sends its own events directly.

Both SDKs tag errors with `routevn-creator@<appVersion>`, the build environment,
and `dist`, which names the exact shipped build: `<build-id>-<target>`. The build
ID is the 12-character Git revision, or `ROUTEVN_BUILD_ID` when set to a
non-empty value of at most 64 ASCII letters, digits, `.`, `_`, or `-`. The
Docker AppImage build passes the host revision this way because its source copy
has no `.git`. The target is `macos`, `windows`, or `linux` for desktop (from
`src-tauri/build.rs`, with `-steam` appended for Steam builds) and `web` for the
web build (from `scripts/build.sh`). Each OS and distribution ships a different
binary and bundle, and symbols are uploaded per `dist`, so they must not share
one. The whole value may not exceed Sentry's 64-character `dist` limit.
Development builds use `local`.

## Source maps

JavaScript stacks from release bundles are minified. Set `ROUTEVN_SOURCEMAPS=1`
for `scripts/build.sh` (any target) to keep hidden source maps for the app
bundle and its chunks:

- `rtgl fe build --sourcemap hidden` writes the maps without a
  `sourceMappingURL` comment.
- `scripts/inject-debug-ids.js` stamps each mapped bundle with a debug ID, the
  convention the Sentry JavaScript SDK reads, and records the same ID in its
  map. It then moves the maps to `ROUTEVN_SOURCEMAP_DIR` (default
  `.artifacts/sourcemaps/<target>`, cleared on each build; a caller-supplied
  directory must be empty) with `debug-ids.json` listing file → debug ID.
- This happens before `_site` is copied into the Android or iOS app or embedded
  by Tauri. Every build fails if any `.map` remains in `_site`, so maps are
  never shipped.

Each target (web, Tauri, Android, iOS) is a different bundle with different
debug IDs, so keep the maps from the exact build that ships. Uploading them is
the release pipeline's job. Reports carry the debug IDs in `debug_meta` as
`sourcemap` images with basename file names, matching their frames. The player
bundles in `static/bundle` run in exported games, which do not report errors,
so they get no maps.

## Native symbols

Rust panic frames carry instruction addresses. The Rust SDK's debug-images
integration lists the loaded binaries with their debug IDs: the Mach-O UUID on
macOS, the PDB GUID and age on Windows, and the GNU build ID on Linux. Events
keep only the images that a sent frame's address falls in, as `symbolic`
images whose `name` and `debug_file` are reduced to basenames. The debug ID
names the separate debug file of the exact binary that crashed.

On macOS, release builds keep line tables in a separate dSYM when built with:

```bash
CARGO_PROFILE_RELEASE_DEBUG=line-tables-only
CARGO_PROFILE_RELEASE_SPLIT_DEBUGINFO=packed
```

Each architecture of the universal build then gets
`src-tauri/target/<arch>-apple-darwin/release/routevn-creator.dSYM` with the
same UUID as that architecture's slice of the shipped binary. The release
pipeline keeps those dSYMs, like the source maps. Windows PDBs and Linux debug
files are not kept yet.

`src-tauri/Cargo.toml` sets the rest of the release profile:

- Only RouteVN's crates get line tables: this crate, `routevn-exporter` and
  `routevn-packager`. Third-party dependencies get no debug info, so their
  frames resolve to function names from the symbol table; their code inlined or
  instantiated in RouteVN's crates keeps its lines. With line tables for every
  dependency, the arm64 symbol cache is about 61 MiB, over the 48 MiB limit of
  `routevn-symbols`; with RouteVN's crates only it is about 34 MiB.
- `strip = "debuginfo"` is set explicitly. Cargo only strips by default when no
  package has debug info, and the shipped binary must carry no DWARF or debug
  map naming the build machine's object files. rustc ignores `strip` on
  Windows, where it always writes the PDB and records only its file name in the
  executable.

Builds without those variables still ship a binary with no DWARF or debug map;
the first-party line tables are removed when it is linked.

## Collection and privacy

The webview enables only the global uncaught-error and unhandled-rejection
handlers, plus event deduplication. Rust enables only the panic integration,
stack frame in-app classification, debug images, and the SDK's normal HTTP
transport over rustls. Each side sends at most 10 events per app session; the
Rust panic hook blocks the panicking thread while its event is sent. The
webview's explicit reports (below) have their own budget of 10, so handled
failures cannot use up the budget for uncaught errors. Tracing, profiling,
replay, feedback, logs/metrics forwarding, screenshots, view hierarchy,
attachments, browser sessions, and browser client reports are disabled by
options or excluded features. The Rust SDK has no client-report switch; it may
attach a loss report to a later error envelope, which the collector discards.
Neither SDK sets a user identity.

`beforeSend` on each side retains the error category, capture mechanism type and
handled flag, and bounded stack location (Rust frames also keep their
instruction address, and the debug images those addresses fall in, which can
include a system library and so identify the OS build) while discarding request
metadata, headers, cookies, body/response dumps, tokens, emails, object
snapshots, and local variables. The webview keeps a sanitized error message
(`sanitizeErrorMessage` in `src/deps/clients/errorReporting.js`): at most 200
characters, with secrets, emails, URLs, file paths, quoted text that is not an
identifier, UUIDs, long hex strings and long numbers replaced by placeholders;
it falls back to a fixed message when nothing is left, and never sends the
serialization of a thrown non-`Error` value. Rust still sends no message: it
keeps the SDK level, `fatal` for panics; the webview reports every event at
level `error`.
Both SDKs keep zero breadcrumbs. The webview flush on quit and the Rust send
after each panic wait at most about two seconds. There is no app-level retry or
forwarding path; the SDK handles collector rate limits and transport errors.

## Local verification

Start `python3 scripts/dev.py` in `routevn-api-2`, then launch the Tauri desktop
app with its development build. The API prints the local DSN and stores accepted
events in `.local/system.sqlite`. To inspect only report IDs and event types:

```bash
sqlite3 .local/system.sqlite \
  "SELECT id, json_extract(data, '$.event.exception.values[0].type') FROM errorEvents ORDER BY created DESC LIMIT 10;"
```

Use one deliberate uncaught webview error and one Rust panic in a disposable
development build when qualifying a release. Each should create one row from
its own SDK. Avoid repeated failures: the collector's request budget is shared
across users.

Release builds have the same checks without a disposable build: create a
project named `ROUTEVN_TEST_PANIC_CRASH` for a Rust panic or
`ROUTEVN_TEST_APP_CRASH` for an uncaught webview error. No project location is
needed. See [test crashes](mobile-crash-reporting.md#test-crashes).

For the Rust panic path, an ignored smoke test sends one synthetic panic through
the configured SDK:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib \
  error_reporting::tests::sends_one_panic_to_local_collector -- \
  --ignored --exact
```

## Explicit reporting (web and desktop)

`appService.reportError(error, { operation, code })` sends an error the app
already handled. It never shows UI. Handled errors are still shown through
`showToast` or `showAlert` separately.

- The web build does not install global handlers, so uncaught browser errors
  are not reported. Only `reportError` calls send anything.
- `scripts/build.sh web` reads the public production DSN from
  `.env.production` and exposes it as `VITE_ROUTEVN_SENTRY_DSN` with
  `VITE_ROUTEVN_SENTRY_ENVIRONMENT=production`. Exporting `VITE_ROUTEVN_SENTRY_DSN`
  first overrides it. Watch-mode dev servers (`watch:web`) and visual test runs
  have no DSN, so reporting is a no-op there.
- Web pages set no Content-Security-Policy, so nothing needs allowing. The
  collector must accept browser cross-origin requests from the web origin.
- Web and desktop share the same environment. Events carry a `runtime` tag
  (`web` or `tauri`) to tell them apart.
- Web builds use the same `release` and choose `dist` like desktop release
  builds: `ROUTEVN_BUILD_ID` when set, otherwise the 12-character Git revision.
  Without Git metadata, and on dev servers, it is `local`.
- Explicit events keep the error type, stack locations, a sanitized message (see
  Collection and privacy), and the stable `runtime`, `operation`, and `code`
  identifiers. Use a fixed `operation` string; never put user text, paths, or
  ids into it.
- Non-`Error` values, such as the strings and plain objects Tauri `invoke`
  rejects with, are sent as a `NonErrorValue` event with no stack and a
  `valueKind` tag (`string`, `object`, or a class name). Their contents are
  not sent; only a `code` that passes the identifier check is kept.
- `AbortError` is ignored. Do not report expected validation or auth failures.
- Do not report expected environment failures. `isProjectStorageUnavailableError`
  in `src/internal/projectOpenErrors.js` matches a project database that cannot
  be opened because its folder was moved, deleted, or is inaccessible (code
  `project_database_missing`, or SQLite code 14 in plugin-sql's message), and
  full browser storage (`QuotaExceededError`).
- Current call sites: project-open route failures, `runResourcePageMutation`
  thrown errors, engine render failures (`operation` `graphics.render`), and
  scene editor canvas renders that throw with no caller waiting for them
  (`sceneEditor.renderCanvas`, which also shows an alert with the error
  details). The first two skip expected environment failures; incompatible
  projects are not reported either.
