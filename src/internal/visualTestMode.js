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

export const isVisualTestMode = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return isTruthyFlag(window.RTGL_VT_RESET_APP_STATE);
};
