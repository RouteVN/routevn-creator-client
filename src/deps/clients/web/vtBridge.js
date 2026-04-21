const VT_NAVIGATE_EVENT = "routevn:vt:navigate";
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const isTruthyFlag = (value) => {
  if (value === true) {
    return true;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value !== "string") {
    return false;
  }

  return TRUE_VALUES.has(value.trim().toLowerCase());
};

const isVisualTestMode = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return isTruthyFlag(window.RTGL_VT_RESET_APP_STATE);
};

const toEventPayload = (currentPayload, detail = {}) => {
  const nextPayload =
    detail.replaceQuery === true || detail.replaceQuery === "true"
      ? {}
      : { ...currentPayload };

  Object.entries(detail).forEach(([key, value]) => {
    if (
      key === "path" ||
      key === "replaceQuery" ||
      key === "shouldUpdateHistory"
    ) {
      return;
    }

    if (typeof value === "string" && value.length > 0) {
      nextPayload[key] = value;
    }
  });

  return nextPayload;
};

export const installVtBridge = ({ subject, router } = {}) => {
  if (
    !isVisualTestMode() ||
    !subject ||
    typeof subject.dispatch !== "function" ||
    !router ||
    typeof router.getPayload !== "function"
  ) {
    return;
  }

  window.addEventListener(VT_NAVIGATE_EVENT, (event) => {
    const detail = event?.detail ?? {};
    const path = typeof detail.path === "string" ? detail.path.trim() : "";
    if (!path) {
      return;
    }

    subject.dispatch("app.route.request", {
      path,
      payload: toEventPayload(router.getPayload() || {}, detail),
      shouldUpdateHistory:
        detail.shouldUpdateHistory !== false &&
        detail.shouldUpdateHistory !== "false",
    });
  });
};
