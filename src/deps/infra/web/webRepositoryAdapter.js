import { loadTemplate } from "../../../utils/templateLoader.js";

// Insieme-compatible Web IndexedDB Store Adapter

const openIDB = (name, version, upgradeCallback) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = upgradeCallback;
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

/**
 * Initialize a new project with IndexedDB.
 */
export const initializeProject = async ({
  name,
  description,
  projectId,
  template,
}) => {
  if (!template) {
    throw new Error("Template is required for project initialization");
  }

  // Initialize database
  const adapter = await createInsiemeWebStoreAdapter(projectId);

  // Load template data from static files
  const templateData = await loadTemplate(template);

  // Add project info to template data
  const initData = {
    ...templateData,
    project: {
      name,
      description,
    },
  };

  // Add the init action directly through adapter
  await adapter.appendEvent({
    type: "init",
    payload: {
      value: initData,
    },
  });

  // Set creator_version to 1 in app table
  await adapter.app.set("creator_version", "1");
};

/**
 * Creates an Insieme-compatible store adapter using IndexedDB for a specific project.
 * @param {string} projectId - Required project ID to create a unique database.
 */
export const createInsiemeWebStoreAdapter = async (projectId) => {
  if (!projectId) {
    throw new Error(
      "Project ID is required. Database must be stored per project.",
    );
  }

  const db = await openIDB(projectId, 1, (event) => {
    const idb = event.target.result;
    if (!idb.objectStoreNames.contains("events")) {
      idb.createObjectStore("events", { keyPath: "id", autoIncrement: true });
    }
    if (!idb.objectStoreNames.contains("app")) {
      idb.createObjectStore("app", { keyPath: "key" });
    }
  });

  return {
    // Insieme store interface
    async getEvents() {
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
    },

    async appendEvent(event) {
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
    },

    // App-specific key-value store for project metadata
    app: {
      get: async (key) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction("app", "readonly");
          const store = transaction.objectStore("app");
          const request = store.get(key);
          request.onsuccess = (event) => {
            const result = event.target.result;
            if (result && result.value) {
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
      set: async (key, value) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction("app", "readwrite");
          const store = transaction.objectStore("app");
          const jsonValue = JSON.stringify(value);
          const request = store.put({ key, value: jsonValue });
          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event.target.error);
        });
      },
      remove: async (key) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction("app", "readwrite");
          const store = transaction.objectStore("app");
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = (event) => reject(event.target.error);
        });
      },
    },
  };
};