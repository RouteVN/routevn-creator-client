export const createAndroidAudioRuntime = ({
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
} = {}) => {
  const contexts = new Set();
  const timers = new Set();
  let nativeActive = true;
  let active = !documentTarget.hidden;
  let hiddenAt = active ? undefined : windowTarget.performance.now();
  let hiddenDuration = 0;
  let graphicsContext;

  const nowMs = () =>
    (hiddenAt ?? windowTarget.performance.now()) - hiddenDuration;

  const reportError = (error) => {
    console.error("[Android audio] Failed to update playback lifecycle", error);
  };

  const scheduleTimer = (timer) => {
    if (!active) return;
    timer.nativeId = windowTarget.setTimeout(
      () => {
        timer.nativeId = undefined;
        if (!active || !timers.has(timer)) return;
        if (timer.intervalMs === undefined) {
          timers.delete(timer);
        } else {
          timer.deadline = nowMs() + timer.intervalMs;
          scheduleTimer(timer);
        }
        timer.callback();
      },
      Math.max(0, timer.deadline - nowMs()),
    );
  };

  const createTimer = (callback, delayMs = 0, intervalMs) => {
    const timer = {
      callback,
      deadline: nowMs() + Math.max(0, delayMs),
      intervalMs,
    };
    timers.add(timer);
    scheduleTimer(timer);
    return timer;
  };

  const clearTimer = (timer) => {
    if (!timers.delete(timer)) return;
    windowTarget.clearTimeout(timer.nativeId);
  };

  const updateActivity = () => {
    const nextActive = nativeActive && !documentTarget.hidden;
    if (nextActive === active) return;
    active = nextActive;

    if (!active) {
      hiddenAt = windowTarget.performance.now();
      for (const timer of timers) {
        windowTarget.clearTimeout(timer.nativeId);
        timer.nativeId = undefined;
      }
      for (const entry of contexts) {
        if (entry.context.state === "running") {
          entry.resumeOnForeground = true;
          void entry.suspend().catch(reportError);
        }
      }
      return;
    }

    hiddenDuration += windowTarget.performance.now() - hiddenAt;
    hiddenAt = undefined;
    for (const entry of contexts) {
      if (entry.resumeOnForeground) {
        entry.resumeOnForeground = false;
        void entry.resume().catch(reportError);
      }
    }
    for (const timer of timers) scheduleTimer(timer);
  };

  const setAppActive = (value) => {
    nativeActive = value;
    updateActivity();
  };

  const createAudioContext = () => {
    const AudioContextConstructor =
      windowTarget.AudioContext ?? windowTarget.webkitAudioContext;
    const context = new AudioContextConstructor();
    const entry = {
      context,
      resume: context.resume.bind(context),
      suspend: context.suspend.bind(context),
      resumeOnForeground: false,
    };
    const close = context.close.bind(context);
    const handleStateChange = () => {
      if (!active && context.state === "running") {
        entry.resumeOnForeground = true;
        void entry.suspend().catch(reportError);
      }
    };

    // RouteGraphics can request a resume after a delayed asset finishes loading.
    // Keep that request pending until the Activity and document are both visible.
    context.resume = () => {
      if (!active) {
        entry.resumeOnForeground = true;
        return Promise.resolve();
      }
      return entry.resume();
    };
    context.close = () => {
      contexts.delete(entry);
      context.removeEventListener("statechange", handleStateChange);
      return close();
    };
    contexts.add(entry);
    context.addEventListener("statechange", handleStateChange);
    handleStateChange();
    return context;
  };

  documentTarget.addEventListener("visibilitychange", updateActivity);
  windowTarget.routeVNSetAppActive = setAppActive;

  return {
    createAudioContext,
    graphicsRuntime: {
      get context() {
        graphicsContext ??= createAudioContext();
        return graphicsContext;
      },
      nowMs,
      setTimeout: (callback, delayMs) => createTimer(callback, delayMs),
      clearTimeout: clearTimer,
      setInterval: (callback, intervalMs) =>
        createTimer(callback, intervalMs, intervalMs),
      clearInterval: clearTimer,
      queueMicrotask: (callback) => windowTarget.queueMicrotask(callback),
    },
    dispose: async () => {
      documentTarget.removeEventListener("visibilitychange", updateActivity);
      if (windowTarget.routeVNSetAppActive === setAppActive) {
        delete windowTarget.routeVNSetAppActive;
      }
      for (const timer of timers) clearTimer(timer);
      await Promise.all(Array.from(contexts, ({ context }) => context.close()));
    },
  };
};
