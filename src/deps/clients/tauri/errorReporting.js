import {
  dedupeIntegration,
  flush,
  globalHandlersIntegration,
  init,
} from "@sentry/browser";
// Tauri injects the compiled configuration before any webview scripts run.
const { dsn, release, environment, dist } =
  globalThis.__ROUTEVN_ERROR_REPORTING__ ?? {};
// Deduplication only drops back-to-back repeats, so also cap each session.
const MAX_EVENTS_PER_SESSION = 10;
let sentEvents = 0;

const safeIdentifier = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_.$-]{1,100}$/.test(value)
    ? value
    : undefined;

const safeFilename = (value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const withoutQuery = value.split(/[?#]/, 1)[0];
  const basename = withoutQuery.split(/[\\/]/).at(-1);
  return basename && /^[A-Za-z0-9_.-]{1,120}$/.test(basename)
    ? basename
    : undefined;
};

const scrubStacktrace = (stacktrace) => {
  if (!Array.isArray(stacktrace?.frames)) {
    return undefined;
  }

  return {
    frames: stacktrace.frames.map((frame) => ({
      filename: safeFilename(frame.filename),
      function: safeIdentifier(frame.function),
      lineno: frame.lineno,
      colno: frame.colno,
      in_app: frame.in_app,
    })),
  };
};

const scrubMechanism = (mechanism) =>
  mechanism
    ? { type: safeIdentifier(mechanism.type), handled: mechanism.handled }
    : undefined;

export const scrubErrorEvent = (event) => ({
  event_id: event.event_id,
  timestamp: event.timestamp,
  platform: "javascript",
  level: "error",
  release,
  environment,
  dist,
  message: "Unhandled webview error",
  exception: event.exception?.values
    ? {
        values: event.exception.values.map((exception) => ({
          type: safeIdentifier(exception.type) ?? "UnknownError",
          value: "Unhandled webview error",
          mechanism: scrubMechanism(exception.mechanism),
          stacktrace: scrubStacktrace(exception.stacktrace),
        })),
      }
    : undefined,
});

const sendErrorEvent = (event) => {
  if (sentEvents >= MAX_EVENTS_PER_SESSION) {
    return null;
  }
  sentEvents += 1;
  return scrubErrorEvent(event);
};

if (dsn) {
  init({
    dsn,
    release,
    environment,
    dist,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    defaultIntegrations: false,
    integrations: [globalHandlersIntegration(), dedupeIntegration()],
    sendClientReports: false,
    enableLogs: false,
    beforeSend: sendErrorEvent,
  });
}

export const flushDesktopErrors = () => (dsn ? flush(2000) : undefined);
