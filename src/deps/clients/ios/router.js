const createPayloadQuery = (payload) => {
  const queryParams = new URLSearchParams();
  Object.entries(payload ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      queryParams.set(key, value);
    }
  });
  return queryParams.toString();
};

const createPathWithPayload = (path, payload) => {
  const query = payload ? createPayloadQuery(payload) : "";
  return query ? `${path}?${query}` : path;
};

const IOS_ROUTER_STACK_STORAGE_KEY = "routevn.ios.router.stack.v1";

const getRouterStorage = () => {
  try {
    return globalThis.window?.sessionStorage;
  } catch {
    return undefined;
  }
};

const isPersistedStack = (stack) => {
  return (
    Array.isArray(stack) &&
    stack.length > 0 &&
    stack.every((entry) => typeof entry === "string" && entry.trim())
  );
};

const readPersistedStack = () => {
  const storage = getRouterStorage();
  if (!storage) {
    return undefined;
  }

  try {
    const rawStack = storage.getItem(IOS_ROUTER_STACK_STORAGE_KEY);
    if (!rawStack) {
      return undefined;
    }

    const stack = JSON.parse(rawStack);
    if (isPersistedStack(stack)) {
      return stack;
    }

    storage.removeItem(IOS_ROUTER_STACK_STORAGE_KEY);
  } catch {
    try {
      storage.removeItem(IOS_ROUTER_STACK_STORAGE_KEY);
    } catch {
      // Storage can be disabled in restricted WebView contexts.
    }
  }

  return undefined;
};

const parsePathAndPayload = (path, payload, state) => {
  const parsed = new URL(path || "/projects", "https://routevn.ios");
  const nextPayload = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    nextPayload[key] = value;
  }

  return {
    path: parsed.pathname || "/projects",
    payload: payload ? { ...payload } : nextPayload,
    state: state && typeof state === "object" ? { ...state } : {},
  };
};

export default class IOSRouter {
  routerType = "ios";
  onStackChange = undefined;

  constructor({
    initialPath = "/projects",
    onStackChange,
    resetStack = false,
  } = {}) {
    const persistedStack = resetStack ? undefined : readPersistedStack();
    const stack = persistedStack ?? [initialPath];
    this.stackEntries = stack.map((path) => parsePathAndPayload(path));
    this.onStackChange = onStackChange;
  }

  persistStack = () => {
    const storage = getRouterStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(IOS_ROUTER_STACK_STORAGE_KEY, JSON.stringify(this.stack));
    } catch {
      // Navigation should keep working even if session storage is unavailable.
    }
  };

  emitStackChange = () => {
    this.persistStack();
    this.onStackChange?.({
      canGoBack: this.canGoBack(),
      stack: this.stack,
    });
  };

  setOnStackChange = (onStackChange) => {
    this.onStackChange = onStackChange;
    this.emitStackChange();
  };

  getCurrentEntry = () => {
    return this.stackEntries[this.stackEntries.length - 1];
  };

  getPathName = () => {
    return this.getCurrentEntry().path;
  };

  getPayload = () => {
    return { ...this.getCurrentEntry().payload };
  };

  getHistoryState = () => {
    return { ...this.getCurrentEntry().state };
  };

  setPayload = (payload) => {
    this.getCurrentEntry().payload = { ...payload };
    this.emitStackChange();
  };

  redirect = (path, payload, options = {}) => {
    this.stackEntries.push(parsePathAndPayload(path, payload, options.state));
    this.emitStackChange();
  };

  replace = (path, payload, options = {}) => {
    this.stackEntries[this.stackEntries.length - 1] = parsePathAndPayload(
      path,
      payload,
      options.state,
    );
    this.emitStackChange();
  };

  back = () => {
    if (!this.canGoBack()) {
      return false;
    }

    this.stackEntries.pop();
    this.emitStackChange();
    return true;
  };

  canGoBack = () => {
    return this.stackEntries.length > 1;
  };

  get stack() {
    return this.stackEntries.map((entry) =>
      createPathWithPayload(entry.path, entry.payload),
    );
  }
}
