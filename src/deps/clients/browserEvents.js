export const createBrowserEventsClient = ({ windowTarget } = {}) => {
  const target = windowTarget ?? globalThis.window;

  return {
    subscribeWindowEvent({ type, listener, options } = {}) {
      target.addEventListener(type, listener, options);

      return () => {
        target.removeEventListener(type, listener, options);
      };
    },
  };
};
