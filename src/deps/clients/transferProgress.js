// Long native calls (a download, an archive extraction) report byte progress
// through a window callback with `{ tempFolderId, current, total }`. A
// subscription receives only the events of its own temporary folder, so a late
// event of an earlier call never moves the current progress bar.
export const createTransferProgressClient = ({ callbackName }) => {
  const listeners = new Set();

  const dispatch = (event) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A failing progress view must not break the native call.
      }
    }
  };

  return {
    subscribe({ tempFolderId, onProgress } = {}) {
      if (typeof onProgress !== "function") {
        return () => {};
      }

      const listener = (event = {}) => {
        if (event.tempFolderId !== tempFolderId) {
          return;
        }
        onProgress({ current: event.current, total: event.total });
      };
      listeners.add(listener);
      window[callbackName] = dispatch;

      return () => {
        listeners.delete(listener);
      };
    },
  };
};
