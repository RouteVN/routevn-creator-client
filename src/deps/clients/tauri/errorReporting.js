import { createErrorReporter } from "../errorReporting.js";

// Tauri injects the compiled configuration, including the per-install crash
// ID, before any webview scripts run.
const { dsn, release, environment, dist, crashId } =
  globalThis.__ROUTEVN_ERROR_REPORTING__ ?? {};

export const errorReporter = createErrorReporter({
  dsn,
  release,
  environment,
  dist,
  crashId,
  runtime: "tauri",
  captureGlobal: true,
});

export const { scrubErrorEvent } = errorReporter;
export const flushDesktopErrors = errorReporter.flush;
