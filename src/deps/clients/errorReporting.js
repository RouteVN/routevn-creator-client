import {
  captureEvent,
  captureException,
  dedupeIntegration,
  flush,
  globalHandlersIntegration,
  init,
  withScope,
} from "@sentry/browser";

// Deduplication only drops back-to-back repeats, so also cap each session.
// Explicit reports and uncaught errors are capped separately, so repeated
// handled failures cannot use up the budget for a later crash.
const MAX_EVENTS_PER_SESSION = 10;
const CAPTURE_MECHANISM_TYPE = "routevn.capture";

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

const MAX_MESSAGE_LENGTH = 200;
const IDENTIFIER_IN_QUOTES = /^[A-Za-z_$][\w$.[\]]{0,59}$/;
// Sentry describes a thrown non-Error with a serialization of its contents.
const SERIALIZED_VALUE_MESSAGE = /^(?:Non-Error|Object captured|Event `)/;

// Keep what explains a failure, such as what threw and on which API or property,
// and drop what can identify a person or their work: secrets, emails, URLs,
// file paths (reduced to a plain file name), quoted text and long numbers or
// IDs. Avoids lookbehind, which iOS 16.0-16.3 WebViews cannot parse.
export const sanitizeErrorMessage = (message) => {
  if (typeof message !== "string" || SERIALIZED_VALUE_MESSAGE.test(message)) {
    return undefined;
  }

  const sanitized = message
    .slice(0, 1000)
    .replace(/\b(?:bearer|basic)\s+\S+/gi, "<secret>")
    .replace(
      /\b(?:token|password|passwd|secret|api[_-]?key|authorization|cookie)\b\s*[=:]\s*\S+/gi,
      "<secret>",
    )
    .replace(/[^\s@'"`()<>]+@[^\s@'"`()<>]+\.[^\s@'"`()<>]+/g, "<email>")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"`)]+/gi, "<url>")
    // A rooted path can contain spaces, such as a project folder name, and
    // nothing says where an unquoted one ends, so it runs to the next quote.
    .replace(
      /(?:[A-Za-z]:\\|\/(?:Users|home|Volumes|private|var|tmp|mnt|opt|root)\/)[^'"`\n]*/g,
      (path) => (/\s/.test(path) ? "<path>" : (safeFilename(path) ?? "<path>")),
    )
    .replace(
      /[A-Za-z]:\\(?:[^\\\s'"`]+\\)*[^\\\s'"`]*/g,
      (path) => safeFilename(path) ?? "<path>",
    )
    .replace(
      /(^|[\s('"`])(\/(?:[^/\s'"`]+\/)+[^/\s'"`]*)/g,
      (_, before, path) => `${before}${safeFilename(path) ?? "<path>"}`,
    )
    .replace(/"[^"]*"|`[^`]*`/g, '"…"')
    .replace(/'([^']*)'/g, (quoted, inner) =>
      IDENTIFIER_IN_QUOTES.test(inner) ? quoted : "'…'",
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "<id>",
    )
    .replace(/\b[0-9a-f]{16,}\b/gi, "<id>")
    .replace(/\d{6,}/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) {
    return undefined;
  }
  return sanitized.length > MAX_MESSAGE_LENGTH
    ? `${sanitized.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : sanitized;
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

const DEBUG_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Random per-install crash ID from the app shell: a lowercase UUID v4,
// separate from the update-check device ID. The shell's reporter passes it in;
// it is the only user field ever sent.
const CRASH_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isCrashId = (value) =>
  typeof value === "string" && CRASH_ID_PATTERN.test(value);

// Keep the source map debug IDs of files in the sent stack, with the same
// basename as their frames, so frames can be matched to the build's private
// source maps. Other images are dropped.
const scrubDebugMeta = (debugMeta, exceptions) => {
  const filenames = new Set();
  for (const exception of exceptions ?? []) {
    for (const frame of exception.stacktrace?.frames ?? []) {
      filenames.add(frame.filename);
    }
  }

  const images = [];
  for (const image of debugMeta?.images ?? []) {
    const codeFile = safeFilename(image.code_file);
    if (
      image.type === "sourcemap" &&
      filenames.has(codeFile) &&
      DEBUG_ID_PATTERN.test(image.debug_id ?? "")
    ) {
      images.push({
        type: "sourcemap",
        code_file: codeFile,
        debug_id: image.debug_id.toLowerCase(),
      });
    }
  }
  return images.length > 0 ? { images } : undefined;
};

const scrubMechanism = (mechanism) =>
  mechanism
    ? { type: safeIdentifier(mechanism.type), handled: mechanism.handled }
    : undefined;

// Only stable identifiers from our own code may become tags; never free text.
const scrubTags = (tags) => {
  const scrubbed = {};
  for (const key of ["runtime", "operation", "code", "valueKind"]) {
    const value = safeIdentifier(tags?.[key]);
    if (value) {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
};

const UNHANDLED_MESSAGE = "Unhandled webview error";
const HANDLED_MESSAGE = "Captured app error";

const isExplicitReport = (event) =>
  event.exception?.values?.some(
    (exception) => exception.mechanism?.type === CAPTURE_MECHANISM_TYPE,
  );

// Describe a thrown non-Error value without reading its contents.
const getValueKind = (value) => {
  if (value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    return typeof value;
  }
  const name = Object.getPrototypeOf(value)?.constructor?.name;
  return name && name !== "Object" ? name : "object";
};

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
  crashId,
}) => {
  const sentEvents = { explicit: 0, global: 0 };

  const scrubErrorEvent = (event) => {
    const values = event.exception?.values;
    const handled = values?.some((exception) => exception.mechanism?.handled);
    const fallbackMessage = handled ? HANDLED_MESSAGE : UNHANDLED_MESSAGE;
    const exceptions = values?.map((exception) => ({
      type: safeIdentifier(exception.type) ?? "UnknownError",
      value: sanitizeErrorMessage(exception.value) ?? fallbackMessage,
      mechanism: scrubMechanism(exception.mechanism),
      stacktrace: scrubStacktrace(exception.stacktrace),
    }));
    return {
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: "javascript",
      level: "error",
      release,
      environment,
      dist,
      tags: scrubTags(event.tags),
      message: exceptions?.[0]?.value ?? fallbackMessage,
      exception: exceptions ? { values: exceptions } : undefined,
      debug_meta: scrubDebugMeta(event.debug_meta, exceptions),
      user: isCrashId(crashId) ? { id: crashId } : undefined,
    };
  };

  const sendErrorEvent = (event) => {
    const source = isExplicitReport(event) ? "explicit" : "global";
    if (sentEvents[source] >= MAX_EVENTS_PER_SESSION) {
      return null;
    }
    sentEvents[source] += 1;
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

    const hint = { mechanism: { type: CAPTURE_MECHANISM_TYPE, handled: true } };
    withScope((scope) => {
      scope.setTag("operation", operation);
      scope.setTag("code", code ?? error?.code);
      if (error instanceof Error) {
        captureException(error, hint);
        return;
      }

      // Tauri `invoke` rejects with strings or plain objects. Send only the
      // value's kind, without a stack: one created here would only point at
      // this file.
      const valueKind = getValueKind(error);
      scope.setTag("valueKind", valueKind);
      captureEvent(
        {
          level: "error",
          exception: {
            values: [
              { type: "NonErrorValue", value: `Non-error ${valueKind}` },
            ],
          },
        },
        hint,
      );
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
