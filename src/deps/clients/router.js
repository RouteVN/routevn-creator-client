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

export default class WebRouter {
  // _routes;
  routerType = "web";
  pendingPayload = undefined;
  pendingPayloadPath = undefined;
  pendingPayloadSourcePath = undefined;
  pendingPayloadTimerId = undefined;
  lastPayloadReplaceAt = 0;

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

    window.history.replaceState(this.getHistoryState(), "", finalPath);
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
      return { ...state };
    }
    return {};
  };

  subscribePopState = (listener) => {
    window.addEventListener("popstate", listener);
    return () => {
      window.removeEventListener("popstate", listener);
    };
  };

  redirect = (path, payload, options = {}) => {
    this.clearPendingPayload();
    const finalPath = createPathWithPayload(path, payload);
    window.history.pushState(options.state ?? {}, "", finalPath);
  };

  replace = (path, payload, options = {}) => {
    this.clearPendingPayload();
    const finalPath = createPathWithPayload(path, payload);
    window.history.replaceState(options.state ?? {}, "", finalPath);
  };

  back = () => {
    this.clearPendingPayload();
    window.history.back();
  };

  get stack() {
    return [];
  }
}
