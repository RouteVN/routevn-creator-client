import {
  dedupeIntegration,
  flush,
  globalHandlersIntegration,
  init,
} from "@sentry/browser";
import tauriConfig from "../../../../src-tauri/tauri.conf.json";

const sentryDsn = import.meta.env?.VITE_ROUTEVN_SENTRY_DSN;
const environment = import.meta.env?.VITE_ROUTEVN_SENTRY_ENVIRONMENT;
const buildId = import.meta.env?.VITE_ROUTEVN_BUILD_ID;

const safeIdentifier = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_.$-]{1,100}$/.test(value)
    ? value
    : "UnknownError";

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

export const scrubErrorEvent = (event) => ({
  event_id: event.event_id,
  timestamp: event.timestamp,
  platform: "javascript",
  level: "error",
  release: `routevn-creator@${tauriConfig.version}`,
  environment,
  dist: buildId,
  message: "Unhandled webview error",
  exception: event.exception?.values
    ? {
        values: event.exception.values.map((exception) => ({
          type: safeIdentifier(exception.type),
          value: "Unhandled webview error",
          stacktrace: scrubStacktrace(exception.stacktrace),
        })),
      }
    : undefined,
});

if (sentryDsn) {
  init({
    dsn: sentryDsn,
    release: `routevn-creator@${tauriConfig.version}`,
    environment,
    dist: buildId,
    sendDefaultPii: false,
    maxBreadcrumbs: 25,
    defaultIntegrations: false,
    integrations: [globalHandlersIntegration(), dedupeIntegration()],
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendClientReports: false,
    enableLogs: false,
    beforeBreadcrumb: () => null,
    beforeSend: scrubErrorEvent,
  });
}

export const flushDesktopErrors = () => (sentryDsn ? flush(2000) : undefined);
