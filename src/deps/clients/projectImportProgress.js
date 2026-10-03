// Native archive imports report progress through a window callback. Only one
// archive import runs at a time, so a subscription receives every event, or
// only the events carrying its project id when the platform sends one.
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
    subscribe({ projectId, onProgress } = {}) {
      if (typeof onProgress !== "function") {
        return () => {};
      }

      const listener = (event = {}) => {
        if (projectId !== undefined && event.projectId !== projectId) {
          return;
        }
        onProgress({
          stage: event.stage,
          current: event.current,
          total: event.total,
        });
      };
      listeners.add(listener);
      window[callbackName] = dispatch;

      return () => {
        listeners.delete(listener);
      };
    },
  };
};
