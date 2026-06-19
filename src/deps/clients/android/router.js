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

const parsePathAndPayload = (path, payload) => {
  const parsed = new URL(path || "/projects", "https://routevn.android");
  const nextPayload = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    nextPayload[key] = value;
  }

  return {
    path: parsed.pathname || "/projects",
    payload: payload ? { ...payload } : nextPayload,
  };
};

export default class AndroidRouter {
  routerType = "android";
  onStackChange = undefined;

  constructor({ initialPath = "/projects", onStackChange } = {}) {
    this.stackEntries = [parsePathAndPayload(initialPath)];
    this.onStackChange = onStackChange;
  }

  emitStackChange = () => {
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

  setPayload = (payload) => {
    this.getCurrentEntry().payload = { ...payload };
    this.emitStackChange();
  };

  redirect = (path, payload) => {
    this.stackEntries.push(parsePathAndPayload(path, payload));
    this.emitStackChange();
  };

  replace = (path, payload) => {
    this.stackEntries[this.stackEntries.length - 1] = parsePathAndPayload(
      path,
      payload,
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
