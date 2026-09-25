# Desktop error reporting

The Tauri desktop app sends uncaught webview errors, unhandled promise
rejections, and Rust panics to the Sentry-compatible collector in
`routevn-api-2`. Browser and Rust use separate official SDKs and their normal
transports. Neither layer forwards failures through the other. Handled errors
stay in their existing UI flows.

## Build configuration

`src-tauri/build.rs` selects the DSN once for both SDKs. Tauri development mode
and debug builds always use the local collector. Packaged release builds use
production. No frontend environment flag or release-script configuration is
needed: Tauri injects the compiled DSN, release, environment, and build ID into
the webview before application scripts run. The injected object is read-only.

Set these two build-time environment variables (also shown in `.env.example`):

```dotenv
ROUTEVN_SENTRY_DEVELOPMENT_DSN="http://11111111111111111111111111111111@127.0.0.1:3000/system/sentry/1"
ROUTEVN_SENTRY_PRODUCTION_DSN="https://4a1f0f2f77f130fd8366487119b90a7d@api1.routevn.com/system/sentry/1"
```

Keep them in the local `.env` when using the `bun run tauri:*` commands, or
export them in the build environment. Direct Cargo commands require the
selected variable to be exported. A missing or empty selected DSN fails the
build. To change a collector URL or public key, replace its environment variable
value and rebuild; no source-code edit is needed.

Use the development DSN printed by `python3 scripts/dev.py` in `routevn-api-2`.
Development DSNs must use HTTP on `localhost` or `127.0.0.1`. The SDK parses the
remaining DSN fields. Each build reads only its selected variable.

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
