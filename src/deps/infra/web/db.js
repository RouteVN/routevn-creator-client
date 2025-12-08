const openIDB = (name, version, upgradeCallback) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = upgradeCallback;
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

/**
 * Create a database instance for the web using IndexedDB.
 * @param {Object} params
 * @param {string} params.path - Database name (e.g., "app.db")
 * @param {boolean} [params.withEvents=false] - Include events table for insieme
 * @returns {{init: Function, get: Function, set: Function, remove: Function, getEvents?: Function, appendEvent?: Function}}
 */
export const createDb = ({ path, withEvents = false }) => {
  const dbName = path.replace("sqlite:", "");
  let db = null;
  let initialized = false;

  const instance = {
    async init() {
      db = await openIDB(dbName, 1, (event) => {
        const idb = event.target.result;
        if (!idb.objectStoreNames.contains("kv")) {
          idb.createObjectStore("kv", { keyPath: "key" });
        }
        if (withEvents && !idb.objectStoreNames.contains("events")) {
          idb.createObjectStore("events", {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      });
      initialized = true;
    },

    async get(key) {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("kv", "readonly");
        const store = transaction.objectStore("kv");
        const request = store.get(key);
        request.onsuccess = (event) => {
          const result = event.target.result;
          if (result && result.value !== undefined) {
            try {
              resolve(JSON.parse(result.value));
            } catch {
              resolve(result.value);
            }
          } else {
            resolve(null);
          }
        };
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async set(key, value) {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("kv", "readwrite");
        const store = transaction.objectStore("kv");
        const jsonValue = JSON.stringify(value);
        const request = store.put({ key, value: jsonValue });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async remove(key) {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("kv", "readwrite");
        const store = transaction.objectStore("kv");
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    },
  };

  if (withEvents) {
    instance.getEvents = async () => {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("events", "readonly");
        const store = transaction.objectStore("events");
        const request = store.getAll();
        request.onsuccess = (event) => {
          const events = event.target.result.map((row) => ({
            type: row.type,
            payload: row.payload ? JSON.parse(row.payload) : null,
          }));
          resolve(events);
        };
        request.onerror = (event) => reject(event.target.error);
      });
    };

    instance.appendEvent = async (event) => {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("events", "readwrite");
        const store = transaction.objectStore("events");
        const eventToStore = {
          type: event.type,
          payload: JSON.stringify(event.payload),
        };
        const request = store.add(eventToStore);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    };
  }

  return instance;
};
