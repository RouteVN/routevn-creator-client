import {
  dedupeIntegration,
  flush,
  globalHandlersIntegration,
  init,
} from "@sentry/browser";
// Native shells inject configuration before document scripts; web uses Vite env.
const config = globalThis.__ROUTEVN_ERROR_REPORTING__ ?? {
  dsn: import.meta.env?.VITE_ROUTEVN_SENTRY_DSN,
  release: import.meta.env?.VITE_ROUTEVN_SENTRY_RELEASE,
  environment: import.meta.env?.VITE_ROUTEVN_SENTRY_ENVIRONMENT,
  dist: import.meta.env?.VITE_ROUTEVN_BUILD_ID,
};
const { dsn, release, environment, dist } = config;
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

const codePath = (value) => value?.split(/[?#]/, 1)[0];

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

const keptFrameFiles = (event) => {
  const files = new Set();
  const traces = (event.exception?.values ?? []).map(
    (value) => value.stacktrace,
  );
  for (const trace of traces) {
    for (const frame of trace?.frames ?? []) {
      const filename = frame.abs_path ?? frame.filename;
      if (filename) files.add(codePath(filename));
    }
  }
  return files;
};

export const scrubErrorEvent = (event) => {
  const frameFiles = keptFrameFiles(event);
  const images = event.debug_meta?.images
    ?.filter(
      (image) =>
        image.type === "sourcemap" &&
        /^[A-Fa-f0-9-]{36}$/.test(image.debug_id ?? "") &&
        frameFiles.has(codePath(image.code_file)),
    )
    .map((image) => ({
      type: "sourcemap",
      debug_id: image.debug_id,
      code_file: safeFilename(image.code_file),
    }));
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: "javascript",
    level: "error",
    release,
    environment,
    dist,
    message: "Unhandled webview error",
    debug_meta: images?.length ? { images } : undefined,
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
  };
};

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
    enableMetrics: false,
    beforeSend: sendErrorEvent,
  });
}

export const flushErrors = () => (dsn ? flush(2000) : undefined);
