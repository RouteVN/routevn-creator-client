// The persistence bridge of the Android and iOS players. The native player
// exposes an object with postMessage(text) and calls its onmessage({ data })
// with each JSON reply; `name` labels its errors, such as "Android player".
const RESPONSE_TIMEOUT_MS = 30_000;

export const createPlayerRuntimeBridge = ({
  bridge,
  name = "Player",
  timeoutMs = RESPONSE_TIMEOUT_MS,
} = {}) => {
  if (typeof bridge?.postMessage !== "function") {
    throw new Error(`${name} bridge is not available.`);
  }
  let nextId = 1;
  const pending = new Map();
  bridge.onmessage = ({ data }) => {
    let response;
    try {
      response = JSON.parse(data);
    } catch {
      return;
    }
    const request = pending.get(response?.id);
    if (!request) return;
    pending.delete(response.id);
    clearTimeout(request.timer);
    if (response.ok === true) {
      request.resolve(response.value);
    } else {
      request.reject(new Error(response.error ?? `${name} request failed.`));
    }
  };

  return (method, payload = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${name} request timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        bridge.postMessage(JSON.stringify({ id, method, payload }));
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
};

// Connects to the bridge on the first call, when the native player has
// installed it.
export const createLazyPlayerRuntimeBridge = ({ getBridge, name }) => {
  let call;
  return (method, payload) => {
    call ??= createPlayerRuntimeBridge({ bridge: getBridge(), name });
    return call(method, payload);
  };
};

const requireKey = (key, label = "Db key") => {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return key;
};

const serializeValue = (value, label = "Db value") => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(`${label} must be JSON-serializable`);
  }
  return serialized;
};

const parseStoredValue = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const createPlayerRuntimeDb = ({
  path = "sqlite:runtime.db",
  durability = "full",
  schemaVersion = 1,
  call,
  name = "Player",
} = {}) => {
  if (
    path !== "sqlite:runtime.db" ||
    durability !== "full" ||
    schemaVersion !== 1
  ) {
    throw new Error(
      `${name} requires runtime.db with full durability and schema version 1.`,
    );
  }
  let initialized = false;
  let queue = Promise.resolve();
  const enqueue = (operation) => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
  const requireInitialized = () => {
    if (!initialized) throw new Error("Db not initialized. Call init() first.");
  };

  return {
    init() {
      return enqueue(async () => {
        if (initialized) return;
        await call("kv.init", {});
        initialized = true;
      });
    },
    async list({ prefix } = {}) {
      if (prefix !== undefined && typeof prefix !== "string") {
        throw new Error("Db list prefix must be a string");
      }
      const payload = {};
      if (prefix !== undefined) payload.prefix = prefix;
      return enqueue(async () => {
        requireInitialized();
        const rows = await call("kv.list", payload);
        return rows.map(({ key, value }) => ({
          key,
          value: parseStoredValue(value),
        }));
      });
    },
    async set(key, value) {
      const payload = { key: requireKey(key), value: serializeValue(value) };
      return enqueue(async () => {
        requireInitialized();
        await call("kv.set", payload);
      });
    },
    async applyBatch({ puts = [], deletes = [] } = {}) {
      if (!Array.isArray(puts))
        throw new Error("Db batch puts must be an array");
      if (!Array.isArray(deletes))
        throw new Error("Db batch deletes must be an array");
      const operations = new Map();
      puts.forEach((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          throw new Error(`Db batch puts[${index}] must be an object`);
        }
        const key = requireKey(entry.key, `Db batch puts[${index}].key`);
        operations.set(key, {
          key,
          value: serializeValue(entry.value, `Db batch puts[${index}].value`),
        });
      });
      deletes.forEach((entry, index) => {
        const key = requireKey(entry, `Db batch deletes[${index}]`);
        operations.set(key, { key });
      });
      const payload = { puts: [], deletes: [] };
      for (const operation of operations.values()) {
        if (operation.value === undefined) payload.deletes.push(operation.key);
        else payload.puts.push(operation);
      }
      return enqueue(async () => {
        requireInitialized();
        if (operations.size > 0) await call("kv.applyBatch", payload);
      });
    },
    clear() {
      return enqueue(async () => {
        requireInitialized();
        await call("kv.clear", {});
      });
    },
  };
};
