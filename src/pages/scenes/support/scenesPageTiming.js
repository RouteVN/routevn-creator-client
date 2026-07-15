const LOG_PREFIX = "[rvn.scenes-perf]";

let nextTraceId = 0;

const roundMs = (value) => Number(Number(value ?? 0).toFixed(2));

export const getScenesPageTimingNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

export const getScenesPageDurationMs = (startedAt) => {
  return roundMs(getScenesPageTimingNow() - startedAt);
};

export const createScenesPageTraceId = (source = "scenes") => {
  nextTraceId += 1;
  return `${source}-${nextTraceId}`;
};

export const logScenesPageTiming = (event, data = {}) => {
  const entry = {
    event,
    ts: roundMs(getScenesPageTimingNow()),
    ...data,
  };

  try {
    console.info(`${LOG_PREFIX} ${JSON.stringify(entry)}`);
  } catch {
    console.info(LOG_PREFIX, entry);
  }
};
