let debugSequence = 0;

const getWindowDebugKey = (scope) => {
  return `__RVN_DEBUG_${String(scope || "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase()}__`;
};

export const isDebugEnabled = (scope) => {
  if (typeof window === "undefined") {
    return false;
  }

  const windowKey = getWindowDebugKey(scope);
  if (window.__RVN_DEBUG_ALL__ === true || window[windowKey] === true) {
    return true;
  }

  return false;
};

export const previewDebugText = (value, maxLength = 120) => {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
};

export const getDebugNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

export const getDebugDurationMs = (startedAt) => {
  return Number((getDebugNow() - startedAt).toFixed(2));
};

const emitDebugLog = (scope, event, data = {}) => {
  debugSequence += 1;
  const timestamp =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? Number(getDebugNow().toFixed(2))
      : Date.now();

  console.log(`[rvn.debug.${scope}]`, {
    seq: debugSequence,
    event,
    ts: timestamp,
    ...data,
  });
};

export const debugLog = (scope, event, data = {}) => {
  if (!isDebugEnabled(scope)) {
    return;
  }

  emitDebugLog(scope, event, data);
};
