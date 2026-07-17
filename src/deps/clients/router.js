const createPayloadQuery = (payload) => {
  const queryParams = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    queryParams.set(key, value);
  });
  return queryParams.toString();
};

const createPathWithPayload = (path, payload) => {
  const query = payload ? createPayloadQuery(payload) : "";
  return query ? `${path}?${query}` : path;
};

const normalizeThrottleMs = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
};

const getCurrentPathWithSearch = () => {
  return `${window.location.pathname}${window.location.search}`;
};

const HISTORY_INDEX_STATE_KEY = "__rvnHistoryIndex";

const getHistoryIndex = (state) => {
  const value = state?.[HISTORY_INDEX_STATE_KEY];
  return Number.isInteger(value) ? value : undefined;
};

const withHistoryIndex = (state, historyIndex) => ({
  ...state,
  [HISTORY_INDEX_STATE_KEY]: historyIndex,
});

export default class WebRouter {
  // _routes;
  routerType = "web";
  pendingPayload = undefined;
  pendingPayloadPath = undefined;
  pendingPayloadSourcePath = undefined;
  pendingPayloadTimerId = undefined;
  lastPayloadReplaceAt = 0;
  currentHistoryIndex = 0;
  renderedHistoryIndex = 0;
  historyTrackingInitialized = false;
  suppressedPopStateCount = 0;

  getPathName = () => {
    return window.location.pathname;
  };

  getPayload = () => {
    if (
      this.pendingPayload &&
      this.pendingPayloadSourcePath === getCurrentPathWithSearch()
    ) {
      return { ...this.pendingPayload };
    }

    const searchParams = new URLSearchParams(window.location.search);
    const payload = {};
    for (const [key, value] of searchParams.entries()) {
      payload[key] = value;
    }
    return payload;
  };

  clearPendingPayload = () => {
    if (this.pendingPayloadTimerId !== undefined) {
      clearTimeout(this.pendingPayloadTimerId);
    }
    this.pendingPayload = undefined;
    this.pendingPayloadPath = undefined;
    this.pendingPayloadSourcePath = undefined;
    this.pendingPayloadTimerId = undefined;
  };

  replacePayload = (payload, path = window.location.pathname) => {
    const finalPath = createPathWithPayload(path, payload);
    const currentPath = getCurrentPathWithSearch();
    if (finalPath === currentPath) {
      return;
    }

    const historyState = this.historyTrackingInitialized
      ? withHistoryIndex(this.getHistoryState(), this.currentHistoryIndex)
      : this.getHistoryState();
    window.history.replaceState(historyState, "", finalPath);
    this.lastPayloadReplaceAt = Date.now();
  };

  flushPendingPayload = () => {
    const payload = this.pendingPayload;
    const path = this.pendingPayloadPath;
    const sourcePath = this.pendingPayloadSourcePath;
    if (this.pendingPayloadTimerId !== undefined) {
      clearTimeout(this.pendingPayloadTimerId);
    }
    this.pendingPayload = undefined;
    this.pendingPayloadPath = undefined;
    this.pendingPayloadSourcePath = undefined;
    this.pendingPayloadTimerId = undefined;

    if (payload && sourcePath === getCurrentPathWithSearch()) {
      this.replacePayload(payload, path);
    }
  };

  schedulePendingPayload = (delayMs) => {
    if (this.pendingPayloadTimerId !== undefined) {
      return;
    }

    this.pendingPayloadTimerId = setTimeout(() => {
      this.flushPendingPayload();
    }, delayMs);
  };

  setPayload = (payload, options = {}) => {
    const throttleMs = normalizeThrottleMs(options.throttleMs);
    if (throttleMs === 0) {
      this.clearPendingPayload();
      this.replacePayload(payload);
      return;
    }

    const elapsedMs = Date.now() - this.lastPayloadReplaceAt;
    this.pendingPayload = { ...payload };
    this.pendingPayloadPath = window.location.pathname;
    this.pendingPayloadSourcePath = getCurrentPathWithSearch();
    if (elapsedMs >= throttleMs) {
      this.flushPendingPayload();
      return;
    }

    this.schedulePendingPayload(throttleMs - elapsedMs);
  };

  getHistoryState = () => {
    const state = window.history.state;
    if (state && typeof state === "object") {
      const publicState = { ...state };
      delete publicState[HISTORY_INDEX_STATE_KEY];
      return publicState;
    }
    return {};
  };

  initializeHistoryTracking = () => {
    if (this.historyTrackingInitialized) {
      return;
    }

    const historyIndex = getHistoryIndex(window.history.state) ?? 0;
    this.currentHistoryIndex = historyIndex;
    this.renderedHistoryIndex = historyIndex;
    this.historyTrackingInitialized = true;
    window.history.replaceState(
      withHistoryIndex(this.getHistoryState(), historyIndex),
      "",
      getCurrentPathWithSearch(),
    );
  };

  subscribePopState = (listener) => {
    this.initializeHistoryTracking();
    const handlePopState = (event) => {
      const destinationHistoryIndex = getHistoryIndex(event.state);
      if (destinationHistoryIndex !== undefined) {
        this.currentHistoryIndex = destinationHistoryIndex;
      }

      if (this.suppressedPopStateCount > 0) {
        this.suppressedPopStateCount -= 1;
        return;
      }

      listener(event);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  };

  redirect = (path, payload, options = {}) => {
    this.clearPendingPayload();
    const finalPath = createPathWithPayload(path, payload);
    if (this.historyTrackingInitialized) {
      this.currentHistoryIndex += 1;
      this.renderedHistoryIndex = this.currentHistoryIndex;
    }
    const historyState = this.historyTrackingInitialized
      ? withHistoryIndex(options.state, this.currentHistoryIndex)
      : (options.state ?? {});
    window.history.pushState(historyState, "", finalPath);
  };

  replace = (path, payload, options = {}) => {
    this.clearPendingPayload();
    const finalPath = createPathWithPayload(path, payload);
    const historyState = this.historyTrackingInitialized
      ? withHistoryIndex(options.state, this.currentHistoryIndex)
      : (options.state ?? {});
    window.history.replaceState(historyState, "", finalPath);
    this.renderedHistoryIndex = this.currentHistoryIndex;
  };

  back = () => {
    this.clearPendingPayload();
    window.history.back();
  };

  restoreAfterFailedPop = () => {
    this.clearPendingPayload();
    const restoreDelta = this.renderedHistoryIndex - this.currentHistoryIndex;
    if (restoreDelta === 0) {
      return;
    }

    this.suppressedPopStateCount += 1;
    window.history.go(restoreDelta);
  };

  acceptCurrentHistoryEntry = () => {
    this.renderedHistoryIndex = this.currentHistoryIndex;
  };

  get stack() {
    return [];
  }
}
