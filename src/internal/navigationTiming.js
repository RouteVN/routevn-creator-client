const LOG_PREFIX = "[rvn.nav-timing]";
const ACTIVE_TRACE_TTL_MS = 2000;

let nextTraceId = 0;
let activeTraceId;
let activeTraceClearTimer;
let cachedAndroidDebugBuild;

export const getNavigationTimingNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

const roundMs = (value) => Number(value.toFixed(2));

const isAndroidDebugBuild = () => {
  if (cachedAndroidDebugBuild !== undefined) {
    return cachedAndroidDebugBuild;
  }

  const bridge =
    typeof window !== "undefined" ? window.RouteVNAndroid : undefined;
  if (typeof bridge?.isDebugBuild === "function") {
    try {
      cachedAndroidDebugBuild = bridge.isDebugBuild() === true;
      return cachedAndroidDebugBuild;
    } catch {
      cachedAndroidDebugBuild = false;
      return cachedAndroidDebugBuild;
    }
  }

  cachedAndroidDebugBuild = false;
  return cachedAndroidDebugBuild;
};

export const isNavigationTimingEnabledForPlatform = (platform) => {
  return platform === "android" && isAndroidDebugBuild();
};

export const isNavigationTimingEnabled = (appService) => {
  return isNavigationTimingEnabledForPlatform(appService?.getPlatform?.());
};

const getEventTimingData = (event) => {
  if (!event) {
    return undefined;
  }

  const now = getNavigationTimingNow();
  const eventTimeStamp = Number(event.timeStamp);
  const hasEventTimeStamp = Number.isFinite(eventTimeStamp);
  const eventAge =
    hasEventTimeStamp && eventTimeStamp > 100000000000
      ? Date.now() - eventTimeStamp
      : now - eventTimeStamp;
  const eventAgeMs = hasEventTimeStamp ? roundMs(eventAge) : undefined;

  return {
    eventType: event.type,
    pointerType: event.pointerType,
    eventTimeStamp: hasEventTimeStamp ? roundMs(eventTimeStamp) : undefined,
    eventAgeMs,
  };
};

const emitTimingLog = (entry) => {
  try {
    console.info(`${LOG_PREFIX} ${JSON.stringify(entry)}`);
  } catch {
    console.info(LOG_PREFIX, entry);
  }
};

const setActiveTrace = (traceId) => {
  activeTraceId = traceId;
  if (activeTraceClearTimer) {
    clearTimeout(activeTraceClearTimer);
  }

  activeTraceClearTimer = setTimeout(() => {
    if (activeTraceId === traceId) {
      activeTraceId = undefined;
    }
  }, ACTIVE_TRACE_TTL_MS);
};

export const getActiveNavigationTimingId = () => activeTraceId;

export const createNavigationTiming = ({
  appService,
  platform,
  source,
  path,
  payload,
  event,
  data,
} = {}) => {
  const resolvedPlatform = platform ?? appService?.getPlatform?.();
  if (!isNavigationTimingEnabledForPlatform(resolvedPlatform)) {
    return undefined;
  }

  const startedAt = getNavigationTimingNow();
  const trace = {
    id: ++nextTraceId,
    startedAt,
    lastAt: startedAt,
    source,
    path,
  };
  setActiveTrace(trace.id);
  emitTimingLog({
    id: trace.id,
    event: "start",
    source,
    path,
    payloadKeys: payload ? Object.keys(payload) : [],
    ts: roundMs(startedAt),
    ...getEventTimingData(event),
    ...data,
  });
  return trace;
};

export const markNavigationTiming = (trace, event, data = {}) => {
  if (!trace) {
    return;
  }

  const now = getNavigationTimingNow();
  emitTimingLog({
    id: trace.id,
    event,
    source: trace.source,
    path: trace.path,
    ts: roundMs(now),
    totalMs: roundMs(now - trace.startedAt),
    deltaMs: roundMs(now - trace.lastAt),
    ...data,
  });
  trace.lastAt = now;
  setActiveTrace(trace.id);
};

export const finishNavigationTiming = (trace, event = "finish", data = {}) => {
  markNavigationTiming(trace, event, data);
};

export const markNavigationPaintTiming = (trace, event, data = {}) => {
  if (!trace || typeof requestAnimationFrame !== "function") {
    return;
  }

  requestAnimationFrame(() => {
    markNavigationTiming(trace, `${event}.raf1`, data);
    requestAnimationFrame(() => {
      markNavigationTiming(trace, `${event}.raf2`, data);
    });
  });
};

export const logNavigationInteractionTiming = ({
  appService,
  platform,
  source,
  event,
  data,
} = {}) => {
  const resolvedPlatform = platform ?? appService?.getPlatform?.();
  if (!isNavigationTimingEnabledForPlatform(resolvedPlatform)) {
    return;
  }

  emitTimingLog({
    event: "interaction",
    activeTraceId,
    source,
    ts: roundMs(getNavigationTimingNow()),
    ...getEventTimingData(event),
    ...data,
  });
};

export const logAndroidBridgeTiming = ({
  method,
  durationMs,
  resultSize,
  ok,
  errorCode,
} = {}) => {
  if (!isNavigationTimingEnabledForPlatform("android")) {
    return;
  }

  emitTimingLog({
    id: activeTraceId,
    event: "android.bridge",
    method,
    durationMs: roundMs(durationMs),
    resultSize,
    ok,
    errorCode,
    ts: roundMs(getNavigationTimingNow()),
  });
};
