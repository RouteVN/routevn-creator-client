# Observability Proposal

This document proposes logging and error tracking infrastructure for RouteVN
Creator.

The goal is to stop being blind when users hit project-open, storage, upload,
runtime, or navigation failures, while keeping the implementation consistent
with the existing dependency and service boundaries.

## Goals

- Provide a dependency-injected logger for handlers, services, and clients.
- Support local development logging through the browser console.
- Support desktop file logging through Tauri.
- Capture exceptions and important error messages to a remote RouteVN API.
- Keep user-facing UI feedback decoupled from remote error reporting.
- Preserve useful diagnostic fields such as error `code`, `status`, `details`,
  and `cause`.
- Redact private project content, credentials, file paths, and user text before
  remote capture.

## Non-Goals

- Do not add a full analytics/event-product system in this layer.
- Do not send raw project state, command payloads, scene text, asset contents,
  auth tokens, or absolute filesystem paths to the remote endpoint.
- Do not make every `logger.error(...)` call automatically send remote error
  reports.
- Do not couple toast/dialog display to error capture.

## Current Insertion Points

The app already has two composition roots:

- `src/setup.web.js`
- `src/setup.tauri.js`

Both setup files create the platform-specific clients and shared services, then
pass dependencies into Rettangoli pages and components. Observability should be
created there and passed down as normal dependencies:

```js
const componentDependencies = {
  logger,
  errorTracker,
  // existing dependencies...
};

const pageDependencies = {
  logger,
  errorTracker,
  // existing dependencies...
};
```

Services that need logging should receive `logger` through their factory
parameters. This keeps page/component handlers simple and follows the existing
dependency direction:

```text
pages/components/primitives
-> internal/ui
-> appService / projectService
-> deps/services
-> deps/clients
```

## Logging Interface

App code should use a small stable logger API:

```js
logger.info(message, context);
logger.warn(message, context);
logger.error(message, context);
```

`message` should be a short stable string. `context` should be plain structured
data. Put subsystem labels in `context.scope` when needed:

```js
logger.warn("connection retry scheduled", {
  scope: "collab",
  projectId,
  attempt,
});
```

The logger should not own UI behavior. It should never show a toast, open a
dialog, or navigate.

### Logger Sinks

The logger should write to one or more sinks. Supported sink interfaces:

```js
sink.write({
  level,
  message,
  context,
  timestamp,
  scope,
  tags,
});
```

Initial sinks:

- `consoleLogSink`
  - web and dev default
  - writes to `console.info`, `console.warn`, and `console.error`
- `tauriLogSink`
  - desktop app default
  - forwards JavaScript logs to `@tauri-apps/plugin-log`
- `memoryLogSink`
  - bounded in-memory ring buffer for breadcrumbs and test assertions
- `noopLogSink`
  - test/default fallback when logging should be silent

Multiple sinks can be active at once. For example, desktop development can write
to both console and Tauri log files.

## Desktop File Logging

The desktop app should use `tauri-plugin-log`, which is already present in
`src-tauri/Cargo.toml`. The plugin needs to be initialized in
`src-tauri/src/lib.rs`, the JavaScript bindings need to be available, and
`src-tauri/capabilities/default.json` needs `log:default`.

Recommended Tauri configuration:

```rust
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

tauri_plugin_log::Builder::new()
    .clear_targets()
    .target(Target::new(TargetKind::LogDir {
        file_name: Some("routevn-creator".to_string()),
    }))
    .target(Target::new(TargetKind::Stdout))
    .level(log::LevelFilter::Info)
    .max_file_size(5 * 1024 * 1024)
    .rotation_strategy(RotationStrategy::KeepSome(5))
    .timezone_strategy(TimezoneStrategy::UseLocal)
    .build()
```

Policy:

- active log file: `routevn-creator.log`
- max active file size: 5 MiB
- rotation strategy: `KeepSome(5)`
- retained files: active file plus the most recent rotated files, up to five
  total log files
- rotated file name pattern:
  `routevn-creator_YYYY-MM-DD_HH-MM-SS.log`
- log level: `Info` in production
- timezone: local time for easier support conversations with users

`Stdout` can be kept for development and removed from production if noisy. The
file target should remain enabled in production desktop builds.

### Log Location

The Tauri application identifier is `com.routevn.creator`. With `LogDir`, logs
are stored in the platform log directory:

- macOS:
  `~/Library/Logs/com.routevn.creator/`
- Windows:
  `%LOCALAPPDATA%\com.routevn.creator\logs\`
- Linux:
  `$XDG_DATA_HOME/com.routevn.creator/logs/` or
  `~/.local/share/com.routevn.creator/logs/`

Support instructions:

- macOS Finder: `Go > Go to Folder...` and paste
  `~/Library/Logs/com.routevn.creator/`
- macOS terminal:
  `open ~/Library/Logs/com.routevn.creator/`
- Windows Explorer: paste
  `%LOCALAPPDATA%\com.routevn.creator\logs\`
- Linux terminal:
  `xdg-open "${XDG_DATA_HOME:-$HOME/.local/share}/com.routevn.creator/logs"`

Later, the app can add a "Copy diagnostics" or "Open log folder" action, but
that should call a diagnostics service. The logger itself should not own UI.

## Error Tracking Interface

App code should use one app-facing error tracker:

```js
errorTracker.capture(value, context);
```

This is the only interface handlers and services should know about. It should
not expose transport details, endpoint URLs, batching, retry state, or UI.
`value` can be an `Error`, a string message, or any unknown thrown/rejected
value. The tracker normalizes the input before transport:

- `Error`
  - preserve `name`, `message`, `stack`, `code`, `status`, `method`,
    `details`, and `cause`
- string
  - capture as a message event with no stack
- other value
  - capture as an unknown event with a safe string preview and sanitized
    structured data when possible

Important separation:

- UI feedback remains explicit through `appService.showToast(...)`,
  `appService.showAlert(...)`, or `appService.showDialog(...)`.
- Remote capture remains explicit through `errorTracker.capture(...)` or global
  crash handlers.
- Capturing an error should not automatically show a toast.
- Showing a toast should not automatically send a remote report.

Example pattern:

```js
try {
  await projectService.ensureRepository();
} catch (error) {
  errorTracker.capture(error, {
    handled: true,
    operation: "project.ensureRepository",
    route: appService.getPath(),
    projectId: appService.getCurrentProjectId(),
  });

  appService.showAlert({
    message: getProjectOpenErrorMessage(error),
  });
}
```

## Error Transports

The only app-facing API is `errorTracker.capture(value, context)`. Internally,
the tracker should separate event capture from event delivery.

Initial delivery modules:

- `noopErrorTransport`
  - default for tests and disabled remote capture
- `rpcErrorTransport`
  - sends events to RouteVN's JSON-RPC API
- `memoryErrorTransport`
  - stores events in memory for tests and local diagnostics

This means the app supports one stable tracker interface, while transport
implementations remain replaceable. The first production implementation should
enable only one remote transport: `rpcErrorTransport`.

If we later need Sentry, PostHog, Honeycomb, or a custom collector, that should
be a new transport behind the same tracker interface. UI and feature code
should not change.

## Queue And Retry

Remote error capture should be queue-first. `errorTracker.capture(...)` should
not wait for the API request to finish.

Capture flow:

1. Normalize the captured value into an event.
2. Redact the event.
3. Assign a stable `eventId`.
4. Add the event to a bounded pending queue.
5. Schedule a background flush.
6. Return to the caller.

The pending queue should be app-level, not project-level:

- desktop: global Tauri `app.db`
- web: global IndexedDB app DB (`app`)
- early boot before DB is ready: bounded in-memory queue, then drain into the
  durable queue after app DB initialization

Recommended queue key for v1:

```text
observability.pendingEvents.v1
```

If implementation adds this persisted key, update
`docs/platform/07-persisted-key-catalog.md` in the same PR.

Queue limits:

- max queued events: 100
- max event payload after redaction: 64 KiB
- max event age: 7 days
- eviction policy: drop oldest queued events first
- storm protection: dedupe repeated events by fingerprint and increment a
  `repeatCount` when possible

Flush behavior:

- flush on app startup after DB initialization
- flush shortly after a new event is queued
- flush when the browser reports `online`
- flush when the app becomes visible again
- flush during desktop close/shutdown when practical, but do not block close
  indefinitely

Retry behavior:

- retry network failures, timeouts, `429`, and `5xx`
- do not retry validation-style `4xx` responses except `429`
- respect `Retry-After` for `429`
- use exponential backoff with jitter
- recommended delay sequence:
  `5s`, `30s`, `2m`, `10m`, then cap at `30m`
- keep per-event `attempts`, `nextAttemptAt`, and `lastAttemptError`
- send events oldest-first with low concurrency, preferably one request at a
  time
- remove an event from the queue only after the server acknowledges it

Drop behavior:

- drop events larger than the max payload size after redaction
- drop events older than the max age
- drop events rejected by the server as invalid
- drop or truncate fields that repeatedly cause oversized payloads

Transport failure handling must not recursively report itself through
`errorTracker.capture(...)`. Delivery failures should use `logger.warn(...)`
with local-only context.

The server should dedupe by `eventId` so retrying the same accepted event is
safe.

## Supported Interfaces Summary

There are multiple interfaces, but each layer should only know about the one it
owns:

- Feature/page/component code:
  - `logger`
  - `errorTracker`
- Logger internals:
  - one sink interface
  - many sink implementations can be active at once
- Error tracker internals:
  - one delivery module interface
  - many delivery implementations can exist
  - v1 should enable only one remote transport in production
- Remote server API:
  - one required JSON-RPC method for v1:
    `observability.captureEvent`

This is intentionally not "one interface total." It is one app-facing tracker
interface, one logger sink interface, one error delivery interface, and one
required remote endpoint for the first server implementation.

## Remote Endpoint

Use the existing API service path as the canonical remote endpoint:

```text
POST {apiBaseUrl}/rpc
```

Required JSON-RPC method:

```text
observability.captureEvent
```

Request shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "observability.captureEvent",
  "params": {
    "event": {
      "eventId": "evt_...",
      "timestamp": 1760000000000,
      "level": "error",
      "message": "Failed to replay repository history",
      "error": {
        "name": "ProjectRepositoryReplayError",
        "stack": "...",
        "code": "history_replay_failed"
      },
      "context": {
        "handled": true,
        "operation": "project.ensureRepository",
        "runtime": "tauri",
        "os": "macos",
        "route": "/project",
        "projectId": "project-id",
        "appVersion": "1.6.0",
        "creatorVersion": 1,
        "userIdHash": "sha256:..."
      },
      "breadcrumbs": []
    }
  }
}
```

Response shape:

```json
{
  "accepted": true,
  "eventId": "evt_..."
}
```

Only this remote API is required for v1. A batch method can be added later:

```text
observability.captureEvents
```

The client-side transport can still buffer and throttle reports internally, but
it should flush through `observability.captureEvent` until the server supports a
batch endpoint.

## Event Model

Normalized event fields:

- `eventId`
- `timestamp`
- `level`: `info`, `warn`, `error`
- `message`
- `error`
  - `name`
  - `stack`
  - `code`
  - `status`
  - `method`
  - `details`
  - `cause`
- `context`
  - `handled`
  - `operation`
  - `runtime`
  - `os`
  - `route`
  - `projectId`
  - `sessionId`
  - `appVersion`
  - `creatorVersion`
  - `userIdHash`, never raw email
- `breadcrumbs`

`error.details`, `context`, and `breadcrumbs` must pass through redaction before
they leave the app.

`context.runtime` identifies the app runtime, for example `web` or `tauri`.
`context.os` identifies the operating system, for example `windows`, `macos`,
`linux`, `ios`, `android`, or `unknown`.

## Redaction Policy

Remote events must not include:

- auth tokens or refresh tokens
- OTPs or register codes
- raw email addresses
- absolute filesystem paths
- user-authored scene text
- project descriptions
- raw command payloads
- raw repository state
- asset binary data or data URLs
- full file names when they may contain user/private data

Allowed diagnostic data:

- route path pattern
- runtime
- operating system
- app version
- creator/project format version
- project id
- command type
- resource type
- resource id
- event index, committed id, or revision number
- counts and byte sizes
- sanitized error code/message/stack

Repository replay errors may include structured `details`. Before remote
capture, replay diagnostics should be reduced to command types, ids, indexes,
and nearby event metadata. Do not send full command payloads.

## Global Capture

Install global capture once in the setup files:

- `window.addEventListener("error", ...)`
- `window.addEventListener("unhandledrejection", ...)`

Global events should be marked with:

```js
{
  handled: false,
  source: "window.error" | "window.unhandledrejection"
}
```

Global capture should not show UI. If a user-facing crash banner is needed
later, it should be a separate app-shell decision.

## Initial Capture Points

Start with high-value failure boundaries:

1. Global `error` and `unhandledrejection`.
2. App route transition failures.
3. Project open and repository hydration failures.
4. Repository replay/projection failures.
5. API transport failures, excluding expected validation/auth failures.
6. Pending queue flush failures.
7. File picker/upload failures.
8. Graphics/runtime asset loading failures.

Do not migrate every existing `console.*` in the first PR. Convert the paths
that are most likely to explain real user failures.

## Configuration

Recommended runtime config shape:

```js
const observabilityConfig = {
  environment: "development" | "production",
  logger: {
    level: "info",
    sinks: ["console", "tauri-log", "memory"],
  },
  errorTracking: {
    enabled: true,
    remoteEnabled: false,
    sampleRate: 1,
    maxBreadcrumbs: 50,
    maxEventsPerMinute: 10,
    queue: {
      durable: true,
      maxEvents: 100,
      maxEventBytes: 64 * 1024,
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    },
    retry: {
      baseDelayMs: 5000,
      maxDelayMs: 30 * 60 * 1000,
    },
  },
};
```

Defaults:

- development web:
  - console logging enabled
  - remote error tracking disabled
- production web:
  - console warnings/errors enabled
  - remote error tracking enabled only after policy decision
- production Tauri:
  - file logging enabled
  - remote error tracking enabled only after policy decision

Remote capture should be easy to disable from config without removing logger
calls.

## Suggested File Layout

```text
src/internal/observability/
  errorSerialization.js
  redaction.js
  eventModel.js

src/deps/services/observability/
  logger.js
  errorTracker.js
  breadcrumbs.js
  pendingEventQueue.js
  retryScheduler.js

src/deps/clients/web/
  consoleLogSink.js
  rpcErrorTransport.js

src/deps/clients/tauri/
  tauriLogSink.js
```

Test-only helpers can live under `tests/` or be exported as explicit memory
sinks/transports.

## Implementation Plan

1. Add pure event serialization and redaction helpers.
2. Add logger service with console, memory, and noop sinks.
3. Add durable pending-event queue service backed by the global app DB, with an
   in-memory early-boot fallback.
4. Add error tracker service with noop, memory, and RPC delivery modules.
5. Add retry scheduler with backoff, jitter, dedupe, queue limits, and
   non-recursive delivery-failure logging.
6. Wire `logger` and `errorTracker` into `src/setup.web.js` and
   `src/setup.tauri.js`.
7. Install global capture in setup.
8. Pass `logger` and `errorTracker` into `projectService`, `appService`,
   `apiService`, `graphicsService`, and the pending queue service.
9. Convert the initial high-value failure boundaries.
10. Initialize `tauri-plugin-log`, add JavaScript bindings, and add
   `log:default` capability.
11. Add server support for `observability.captureEvent`.
12. Add support/debug UI for locating or exporting local desktop logs.

## Testing

Unit tests:

- error serialization preserves `name`, `message`, `stack`, `code`, `status`,
  `method`, `details`, and nested `cause`
- redaction removes tokens, emails, absolute paths, data URLs, and raw command
  payloads
- logger fans out to multiple sinks
- error tracker respects disabled remote transport
- RPC transport sends the expected JSON-RPC method and payload shape
- capture stores events before attempting remote delivery
- retry scheduler retries network, `429`, and `5xx` failures
- retry scheduler drops invalid `4xx` failures
- queue limits drop oldest events first
- delivery failures do not recursively capture themselves

Integration tests:

- project open failure captures one handled exception and still shows the
  correct alert
- global unhandled rejection captures one unhandled exception
- repeated identical errors are throttled
- queued events survive app service recreation and flush after the API recovers

Tauri validation:

- desktop build creates `routevn-creator.log`
- file rotates after the configured max size
- old rotated files are pruned according to `KeepSome(5)`
- support paths open the expected platform log directory

## Open Decisions

- Should remote error tracking be enabled by default in production, or require
  explicit user opt-in?
- Should anonymous remote events be allowed before login?
- What is the server retention policy?
- Should desktop production keep `Stdout`, or only write to `LogDir`?

## References

- Tauri logging plugin:
  `https://v2.tauri.app/plugin/logging/`
- Rettangoli handler dependency contract:
  `https://raw.githubusercontent.com/yuusoft-org/rettangoli/refs/heads/main/packages/rettangoli-fe/docs/handlers.md`
