const LOG_PREFIX = "[rvn.scene-editor-timing]";

let nextTraceId = 0;

export const shouldMeasureSceneEditorTiming = () => true;

export const getSceneEditorTimingNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

export const roundSceneEditorTimingMs = (value) =>
  Number(Number(value || 0).toFixed(2));

export const getSceneEditorTimingDurationMs = (startedAt) =>
  roundSceneEditorTimingMs(getSceneEditorTimingNow() - startedAt);

export const createSceneEditorTimingTraceId = (prefix = "scene-editor") => {
  nextTraceId += 1;
  return `${prefix}-${Date.now().toString(36)}-${nextTraceId}`;
};

export const emitSceneEditorTiming = (event, data = {}) => {
  const entry = {
    event,
    ts: roundSceneEditorTimingMs(getSceneEditorTimingNow()),
    ...data,
  };

  try {
    console.info(`${LOG_PREFIX} ${JSON.stringify(entry)}`);
  } catch {
    console.info(LOG_PREFIX, entry);
  }
};
