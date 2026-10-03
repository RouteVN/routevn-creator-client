// Native import calls report progress through a window callback with
// `{ stagingId, current, total }`. A subscription receives only the events of
// its own staging folder, so a late event of an earlier import never moves the
// current progress bar.
export const createProjectImportProgressClient = ({ callbackName }) => {
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
    subscribe({ stagingId, onProgress } = {}) {
      if (typeof onProgress !== "function") {
        return () => {};
      }

      const listener = (event = {}) => {
        if (event.stagingId !== stagingId) {
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
