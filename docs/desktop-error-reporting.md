# Desktop error reporting

The Tauri desktop app sends uncaught webview errors, unhandled promise
rejections, and Rust panics to the Sentry-compatible collector in
`routevn-api-2`. Browser and Rust use separate official SDKs and their normal
transports. Neither layer forwards failures through the other. Handled errors
stay in their existing UI flows.

## Build configuration

One variable, `ROUTEVN_SENTRY_DSN`, is defined in two environment files:

- `.env.development`: the local API DSN, used by `tauri:dev:*`, Cargo tests,
  and debug builds.
- `.env.production`: the production API DSN, used by `tauri:build`, platform
  release scripts, and Steam release builds.

`src-tauri/build.rs` reads the matching file automatically using Tauri's build
mode. The same selection applies to every desktop build entry point, including
the Linux Docker build. A Tauri development run with the release profile still
uses `.env.development`. Edit the value in the relevant file and rebuild;
Cargo watches these files for changes. No script edits or manual exports are
needed. The selected file is authoritative, so an inherited value from `.env`
or the shell cannot override it.

Both files contain public routing DSNs and are checked in. Keep signing keys
and other secrets in the ignored `.env`, not in these files. Missing files or
missing/empty DSNs fail the build.

Tauri injects the compiled DSN into the webview before application scripts run,
along with the release, build ID, and environment label. The injected object is
read-only. Both official SDKs receive the same configuration.

Use the development DSN printed by `python3 scripts/dev.py` in `routevn-api-2`.
Development builds reject DSNs outside HTTP on `localhost` or `127.0.0.1`, so
loading production settings by mistake cannot send development errors there.
The SDK parses the remaining DSN fields.

The key is public SDK routing data; it is never a RouteVN bearer credential.
Do not add RouteVN authentication headers, cookies, or RPC tokens to SDK
transport requests. Passing configuration to the webview does not forward
webview errors through Rust; each official SDK sends its own events directly.

Both SDKs tag errors with `routevn-creator@<appVersion>`, the build environment,
and the Git revision as `dist` where the SDK supports it. Rust adds its build
revision to the event. The current collector has no symbolication; builds do
not upload source maps. Keep release and build identifiers so future tooling can
match a report to its build.

## Collection and privacy

The webview enables only the global uncaught-error and unhandled-rejection
handlers, plus event deduplication. Rust enables only the panic integration and
the SDK's normal HTTP transport. Tracing, profiling, replay, feedback,
logs/metrics forwarding, screenshots, view hierarchy, attachments, browser
sessions, and browser client reports are disabled by options or excluded
features. The Rust SDK has no client-report switch; it may attach a loss report
to a later error envelope, which the collector discards. Neither SDK sets a
user identity.

`beforeSend` on each side retains the error category and bounded stack location
while discarding request metadata, headers, cookies, body/response dumps,
tokens, emails, object snapshots, local variables, and arbitrary error message
text. `beforeBreadcrumb` drops breadcrumbs. SDK shutdown is bounded to about
two seconds. There is no app-level retry or forwarding path; the SDK handles
collector rate limits and transport errors.

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
