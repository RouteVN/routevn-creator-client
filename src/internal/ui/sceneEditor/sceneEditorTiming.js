import { isDebugEnabled } from "../../../deps/services/shared/debugLog.js";

const LOG_PREFIX = "[rvn.scene-editor-timing]";
const SCENE_EDITOR_TIMING_SCOPE = "scene-editor-perf";

let nextTraceId = 0;

export const shouldMeasureSceneEditorTiming = () =>
  isDebugEnabled(SCENE_EDITOR_TIMING_SCOPE);

const getRawSceneEditorTimingNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

export const getSceneEditorTimingNow = () => {
  if (!shouldMeasureSceneEditorTiming()) {
    return 0;
  }

  return getRawSceneEditorTimingNow();
};

export const roundSceneEditorTimingMs = (value) =>
  Number(Number(value || 0).toFixed(2));

export const getSceneEditorTimingDurationMs = (startedAt) =>
  shouldMeasureSceneEditorTiming()
    ? roundSceneEditorTimingMs(getRawSceneEditorTimingNow() - startedAt)
    : 0;

export const createSceneEditorTimingTraceId = (prefix = "scene-editor") => {
  if (!shouldMeasureSceneEditorTiming()) {
    return undefined;
  }

  nextTraceId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextTraceId}`;
};

export const emitSceneEditorTiming = (event, data = {}) => {
  if (!shouldMeasureSceneEditorTiming()) {
    return;
  }

  const entry = {
    event,
    ts: roundSceneEditorTimingMs(getRawSceneEditorTimingNow()),
    ...data,
  };

  try {
    console.info(`${LOG_PREFIX} ${JSON.stringify(entry)}`);
  } catch {
    console.info(LOG_PREFIX, entry);
  }
};
