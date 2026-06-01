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

export default class WebRouter {
  // _routes;
  routerType = "web";
  pendingPayload = undefined;
  pendingPayloadPath = undefined;
  pendingPayloadTimerId = undefined;
  lastPayloadReplaceAt = 0;

  getPathName = () => {
    return window.location.pathname;
  };

  getPayload = () => {
    if (
      this.pendingPayload &&
      this.pendingPayloadPath === window.location.pathname
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
    this.pendingPayloadTimerId = undefined;
  };

  replacePayload = (payload, path = window.location.pathname) => {
    const finalPath = createPathWithPayload(path, payload);
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (finalPath === currentPath) {
      return;
    }

    window.history.replaceState({}, "", finalPath);
    this.lastPayloadReplaceAt = Date.now();
  };

  flushPendingPayload = () => {
    const payload = this.pendingPayload;
    const path = this.pendingPayloadPath;
    if (this.pendingPayloadTimerId !== undefined) {
      clearTimeout(this.pendingPayloadTimerId);
    }
    this.pendingPayload = undefined;
    this.pendingPayloadPath = undefined;
    this.pendingPayloadTimerId = undefined;

    if (payload && path === window.location.pathname) {
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
    if (elapsedMs >= throttleMs) {
      this.flushPendingPayload();
      return;
    }

    this.schedulePendingPayload(throttleMs - elapsedMs);
  };

  redirect = (path, payload) => {
    this.clearPendingPayload();
    const finalPath = createPathWithPayload(path, payload);
    window.history.pushState({}, "", finalPath);
  };

  replace = (path, payload) => {
    this.clearPendingPayload();
    const finalPath = createPathWithPayload(path, payload);
    window.history.replaceState({}, "", finalPath);
  };

  back = () => {
    this.clearPendingPayload();
    window.history.back();
  };

  get stack() {
    return [];
  }
}
