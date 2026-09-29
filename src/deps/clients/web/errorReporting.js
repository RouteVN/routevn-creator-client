import { createErrorReporter } from "../errorReporting.js";
import { isVisualTestMode } from "../../../internal/visualTestMode.js";

// The web build only sends errors passed to `capture`; uncaught browser errors
// are noisy and are not reported. Visual test runs never report.
export const createWebErrorReporter = ({ release }) =>
  createErrorReporter({
    dsn: isVisualTestMode()
      ? undefined
      : import.meta.env?.VITE_ROUTEVN_SENTRY_DSN,
    release,
    environment: import.meta.env?.VITE_ROUTEVN_SENTRY_ENVIRONMENT,
    runtime: "web",
    captureGlobal: false,
  });
