// Native Android APK export reports `{ exportId, phase, current, total,
// elapsedMs }` through one window callback. A subscription receives only the
// events of its own export, so a late event of an earlier export never moves
// the current progress dialog.
export const APK_EXPORT_PROGRESS_CALLBACK = "__routeVNApkExportProgress";

export const createApkExportProgressClient = ({
  callbackName = APK_EXPORT_PROGRESS_CALLBACK,
  target = globalThis,
} = {}) => {
  const listeners = new Set();

  const dispatch = (event = {}) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A failing progress view must not break the native export.
      }
    }
  };

  return {
    subscribe({ exportId, onProgress } = {}) {
      if (typeof onProgress !== "function") {
        return () => {};
      }

      const listener = (event) => {
        if (event.exportId !== exportId) {
          return;
        }
        onProgress({
          phase: event.phase,
          current: event.current,
          total: event.total,
          elapsedMs: event.elapsedMs,
        });
      };
      listeners.add(listener);
      target[callbackName] = dispatch;

      return () => {
        listeners.delete(listener);
      };
    },
  };
};
