import {
  loadTemplate,
  getTemplateFiles,
} from "../../../utils/templateLoader.js";
import { projectRepositoryStateToDomainState } from "../../../domain/v2/stateProjection.js";

// Insieme-compatible Web IndexedDB Store Adapter

const openIDB = (name, version, upgradeCallback) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = upgradeCallback;
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

async function copyTemplateFiles(templateId, adapter) {
  const templateFilesPath = `/templates/${templateId}/files/`;
  const filesToCopy = await getTemplateFiles(templateId);

  for (const fileName of filesToCopy) {
    try {
      const sourcePath = templateFilesPath + fileName;

      // Fetch from the web server and save to IndexedDB
      const response = await fetch(sourcePath + "?raw");
      if (response.ok) {
        const blob = await response.blob();
        await adapter.setFile(fileName, blob);
      }
    } catch (error) {
      console.error(`Failed to copy template file ${fileName}:`, error);
    }
  }
}

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

  // Copy template files to project's IndexedDB
  await copyTemplateFiles(template, adapter);

  // Add project info to template data
  const initData = {
    ...templateData,
    model_version: 2,
    project: {
      id: projectId,
      name,
      description,
    },
  };

  const domainState = projectRepositoryStateToDomainState({
    repositoryState: initData,
    projectId,
  });

  // Persist typed canonical bootstrap state.
  await adapter.appendTypedEvent({
    type: "typedSnapshot",
    payload: {
      projectId,
      state: domainState,
    },
  });

  // Set creator_version to 2 in app table
  await adapter.app.set("creator_version", "2");
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
    if (!idb.objectStoreNames.contains("files")) {
      idb.createObjectStore("files", { keyPath: "id" });
    }
  });

  return {
    // Insieme store interface
    async getEvents(payload = {}) {
      const { since } = payload;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("events", "readonly");
        const store = transaction.objectStore("events");
        const request = store.getAll();
        request.onsuccess = (event) => {
          let events = event.target.result;

          // Filter by since if provided (using auto-increment id)
          if (since !== undefined) {
            events = events.filter((row) => row.id > since);
          }

          resolve(
            events.map((row) => ({
              type: row.type,
              payload: row.payload ? JSON.parse(row.payload) : null,
            })),
          );
        };
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async appendTypedEvent(event) {
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

    async getFile(id) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("files", "readonly");
        const store = transaction.objectStore("files");
        const request = store.get(id);
        request.onsuccess = (event) => {
          resolve(event.target.result?.data); // data is the Blob
        };
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async setFile(id, data) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("files", "readwrite");
        const store = transaction.objectStore("files");
        const request = store.put({ id, data });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    },
  };
};
