import {
  captureException,
  dedupeIntegration,
  flush,
  globalHandlersIntegration,
  init,
  withScope,
} from "@sentry/browser";

// Deduplication only drops back-to-back repeats, so also cap each session.
const MAX_EVENTS_PER_SESSION = 10;

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

// Only stable identifiers from our own code may become tags; never free text.
const scrubTags = (tags) => {
  const scrubbed = {};
  for (const key of ["runtime", "operation", "code"]) {
    const value = safeIdentifier(tags?.[key]);
    if (value) {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
};

const UNHANDLED_MESSAGE = "Unhandled webview error";
const HANDLED_MESSAGE = "Captured app error";

// Create the app-facing reporter around the official browser SDK.
// `captureGlobal` installs the uncaught-error and unhandled-rejection handlers;
// without it, only errors passed to `capture` are sent.
export const createErrorReporter = ({
  dsn,
  release,
  environment,
  dist,
  runtime,
  captureGlobal,
}) => {
  let sentEvents = 0;

  const scrubErrorEvent = (event) => {
    const values = event.exception?.values;
    const handled = values?.some((exception) => exception.mechanism?.handled);
    const message = handled ? HANDLED_MESSAGE : UNHANDLED_MESSAGE;
    return {
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: "javascript",
      level: "error",
      release,
      environment,
      dist,
      tags: scrubTags(event.tags),
      message,
      exception: values
        ? {
            values: values.map((exception) => ({
              type: safeIdentifier(exception.type) ?? "UnknownError",
              value: message,
              mechanism: scrubMechanism(exception.mechanism),
              stacktrace: scrubStacktrace(exception.stacktrace),
            })),
          }
        : undefined,
    };
  };

  const sendErrorEvent = (event) => {
    if (sentEvents >= MAX_EVENTS_PER_SESSION) {
      return null;
    }
    sentEvents += 1;
    return scrubErrorEvent(event);
  };

  const integrations = [dedupeIntegration()];
  if (captureGlobal) {
    integrations.unshift(globalHandlersIntegration());
  }

  if (dsn) {
    init({
      dsn,
      release,
      environment,
      dist,
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      defaultIntegrations: false,
      integrations,
      initialScope: { tags: { runtime } },
      sendClientReports: false,
      enableLogs: false,
      enableMetrics: false,
      beforeSend: sendErrorEvent,
    });
  }

  // Explicitly report an error the app already handled. Only the error type,
  // stack locations, and the stable `operation`/`code` identifiers are sent.
  const capture = (error, { operation, code } = {}) => {
    if (!dsn || error?.name === "AbortError") {
      return;
    }

    withScope((scope) => {
      scope.setTag("operation", operation);
      scope.setTag("code", code ?? error?.code);
      captureException(error instanceof Error ? error : new Error("Unknown"), {
        mechanism: { type: "routevn.capture", handled: true },
      });
    });
  };

  return {
    scrubErrorEvent,
    sendErrorEvent,
    capture,
    flush: () => (dsn ? flush(2000) : undefined),
  };
};

export const noopErrorTracker = {
  capture: () => {},
};
