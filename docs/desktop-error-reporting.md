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
and a build ID as `dist`. Production builds use the 12-character Git revision
(or `ROUTEVN_BUILD_ID` when set) followed by the target OS and distribution,
such as `7cc5f5ad2bcd-macos-direct`. This keeps each platform's immutable
symbol manifest distinct. The Docker AppImage build passes the host revision
because its source copy has no `.git`. Development builds use `local`. Release
and build identifiers key the uploaded JavaScript maps and native symbols.
The uploader writes separate `javascript` and `native` manifests because those
are the Sentry event platforms.

## Collection and privacy

The webview enables only the global uncaught-error and unhandled-rejection
handlers, plus event deduplication. Rust enables the panic, process stacktrace,
and debug image integrations with the SDK's HTTP transport over rustls. Each
side sends at most 10 events per app session; the Rust panic hook
blocks the panicking thread while its event is sent. Tracing, profiling, replay,
feedback, logs/metrics forwarding, screenshots, view hierarchy, attachments,
browser sessions, and browser client reports are disabled by options or
excluded features. The Rust SDK has no client-report switch; it may attach a
loss report to a later error envelope, which the collector discards. Neither
SDK sets a user identity.

`beforeSend` on each side retains the error category, capture mechanism type
and handled flag, and bounded stack location (Rust frames also keep their
instruction address) while discarding request metadata, headers, cookies,
body/response dumps, tokens, emails, object snapshots, local variables, and
arbitrary error message text. Both scrubbers keep only debug images referenced
by retained frames, with IDs and basenamed paths. Rust keeps the SDK level,
`fatal` for panics; the webview reports every event at level `error`. Both SDKs keep zero
breadcrumbs. The webview flush on quit and the Rust send after each panic wait
at most about two seconds. There is no app-level retry or forwarding path; the
SDK handles collector rate limits and transport errors.

## Symbols

Release scripts generate hidden JavaScript maps with debug IDs and retain them
under `.artifacts/crash-symbols/<platform>/<release>-<dist>/js/`. The macOS
dSYMs, Linux debug ELF, or Windows PDB is retained under the same build's
`native/` directory. Maps and native debug files are excluded from shipped
assets.

`src-tauri/Cargo.toml` builds release with full debug info, and the release
scripts strip what ships between `tauri build --no-bundle` and `tauri bundle`:

| OS      | Debug file (uploaded)                                           | Shipped binary                                                                                                  |
| ------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| macOS   | `<binary>.dSYM` from `split-debuginfo = "packed"`, one per arch | `strip -S` by `scripts/strip-shipped-binary.sh macos`                                                           |
| Linux   | `<binary>.debug` from `objcopy --only-keep-debug`               | `strip --strip-debug` by `scripts/strip-shipped-binary.sh linux`; needs a GNU build ID, which the script checks |
| Windows | `<crate_name>.pdb`                                              | debug info is never in the `.exe`                                                                               |

Linux sets `CARGO_PROFILE_RELEASE_SPLIT_DEBUGINFO=off` and keeps `NO_STRIP=1` so
linuxdeploy does not strip again. The Windows `.exe` embeds the absolute PDB
path of the build machine. TODO: on the first real Windows build, check that
path with `strings -e l`/`llvm-readobj --coff-debug-directory` and, if it
matters, add `-C link-arg=/PDBALTPATH:%_PDB%` to the Windows build's rustflags. `@rettangoli/fe` 1.4.3 exposes no source-map option and hardcodes
`sourcemap: false`; `scripts/build-rettangoli-with-maps.js` uses its pinned
Vite plugin for release map builds.
The player Vite bundle is `player-main.js` in Creator assets so its map has a
different basename from Rettangoli's `main.js`; exported players still use
`main.js`.

Install `routevn-symbols` with
`cargo install --locked --git ssh://git@github.com/RouteVN/routevn-observability --bin routevn-symbols`, set
`ROUTEVN_SYMBOLS_AWS_PROFILE` (only needed to upload), and run the release
script. Its upload call prints a plan by default without touching AWS; set
`ROUTEVN_SYMBOLS_UPLOAD=1` to upload. The Linux Docker build also needs
`ROUTEVN_SYMBOLS_REV`, the `routevn-observability` commit that provides
`routevn-symbols`. Release
scripts stop if an enabled upload fails. For a web release, set
`VITE_ROUTEVN_SENTRY_DSN`, run `ROUTEVN_CRASH_SYMBOLS=1 bun run build:web`,
then `bash scripts/upload-crash-symbols.sh web` before publishing `_site`.

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

For the Rust panic path, an ignored smoke test sends one synthetic panic through
the configured SDK:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib \
  error_reporting::tests::sends_one_panic_to_local_collector -- \
  --ignored --exact
```
