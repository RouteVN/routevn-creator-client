import { createErrorReporter } from "../errorReporting.js";

// The iOS app sets the configuration of its native crash reporting,
// including the device ID, before any page script runs. Builds that do not
// report set nothing, and the reporter then sends nothing.
const { dsn, release, environment, dist, deviceId } =
  globalThis.__ROUTEVN_ERROR_REPORTING__ ?? {};

export const errorReporter = createErrorReporter({
  dsn,
  release,
  environment,
  dist,
  deviceId,
  runtime: "ios",
  captureGlobal: true,
});
