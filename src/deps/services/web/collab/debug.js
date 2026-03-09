const parseEnabledFlag = (value) => value === "1" || value === "true";

export const resolveCollabDebugEnabled = () => {
  const params = new URLSearchParams(window.location.search);
  if (parseEnabledFlag(params.get("collabDebug"))) {
    return true;
  }

  try {
    const storedValue = localStorage.getItem("routevn.collab.debug");
    return parseEnabledFlag(storedValue);
  } catch {
    return false;
  }
};

export const createCollabDebugLogger =
  ({ enabled }) =>
  (level, message, meta = {}) => {
    if (!enabled && level !== "error") {
      return;
    }

    const fn =
      level === "error"
        ? console.error.bind(console)
        : level === "warn"
          ? console.warn.bind(console)
          : console.info.bind(console);

    fn(`[routevn.collab.debug] ${message}`, meta);
  };
