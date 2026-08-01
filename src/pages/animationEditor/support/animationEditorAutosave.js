export const DEFAULT_ANIMATION_EDITOR_AUTOSAVE_TIMING = {
  debounceMs: 900,
  minIntervalMs: 1000,
  maxIntervalMs: 3000,
};

const defaultNowMs = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

export const clearScheduledAnimationEditorAutosave = (store) => {
  const timerId = store.selectAutosaveTimerId();
  if (timerId !== undefined) {
    clearTimeout(timerId);
    store.clearAutosaveTimer();
  }
};

export const getAnimationEditorAutosaveDelayMs = (
  store,
  {
    nowMs = defaultNowMs,
    timing = DEFAULT_ANIMATION_EDITOR_AUTOSAVE_TIMING,
  } = {},
) => {
  const now = nowMs();
  const lastFlushStartedAt = store.selectLastAutosaveFlushStartedAt();
  const pendingSinceAt = store.selectAutosavePendingSinceAt();
  const remainingThrottleMs =
    lastFlushStartedAt !== undefined
      ? Math.max(0, timing.minIntervalMs - (now - lastFlushStartedAt))
      : 0;
  const remainingMaxWaitMs =
    pendingSinceAt !== undefined
      ? Math.max(0, timing.maxIntervalMs - (now - pendingSinceAt))
      : Number.POSITIVE_INFINITY;
  const debounceDelayMs = Math.min(timing.debounceMs, remainingMaxWaitMs);

  return Math.max(remainingThrottleMs, debounceDelayMs);
};

export const scheduleAnimationEditorAutosave = (
  store,
  flush,
  {
    nowMs = defaultNowMs,
    timing = DEFAULT_ANIMATION_EDITOR_AUTOSAVE_TIMING,
  } = {},
) => {
  clearScheduledAnimationEditorAutosave(store);

  if (store.selectAutosavePersistedVersion() >= store.selectAutosaveVersion()) {
    store.setAutosavePendingSinceAt({ timestamp: undefined });
    return;
  }

  if (store.selectAutosavePendingSinceAt() === undefined) {
    store.setAutosavePendingSinceAt({ timestamp: nowMs() });
  }

  const delayMs = getAnimationEditorAutosaveDelayMs(store, {
    nowMs,
    timing,
  });
  const timerId = setTimeout(() => {
    void flush().catch(() => {});
  }, delayMs);
  store.setAutosaveTimerId({ timerId });

  return delayMs;
};
