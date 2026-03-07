import {
  loadTemplate,
  getTemplateFiles,
} from "../../../utils/templateLoader.js";
import { projectRepositoryStateToDomainState } from "../../../domain/stateProjection.js";
import { createProjectCreatedRepositoryEvent } from "../../services/shared/projectRepository.js";

// Insieme-compatible Web IndexedDB Store Adapter

const REPOSITORY_DB_VERSION = 2;
const MATERIALIZED_VIEW_STORE = "materialized_view_state";

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
export const initializeProject = async ({ projectId, template }) => {
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
    },
  };

  const domainState = projectRepositoryStateToDomainState({
    repositoryState: initData,
    projectId,
  });

  await adapter.appendEvent(
    createProjectCreatedRepositoryEvent({
      projectId,
      state: domainState,
    }),
  );

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

  const db = await openIDB(projectId, REPOSITORY_DB_VERSION, (event) => {
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
    if (!idb.objectStoreNames.contains(MATERIALIZED_VIEW_STORE)) {
      idb.createObjectStore(MATERIALIZED_VIEW_STORE, {
        keyPath: ["viewName", "partition"],
      });
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
          try {
            let events = event.target.result;

            // Filter by since if provided (using auto-increment id)
            if (since !== undefined) {
              events = events.filter((row) => row.id > since);
            }

            resolve(
              events.map((row) => {
                if (
                  typeof row.payload !== "string" ||
                  row.payload.length === 0
                ) {
                  throw new Error("Repository event row is missing payload");
                }
                return JSON.parse(row.payload);
              }),
            );
          } catch (error) {
            reject(error);
          }
        };
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async appendEvent(event) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("events", "readwrite");
        const store = transaction.objectStore("events");
        const eventToStore = {
          payload: JSON.stringify(event),
          createdAt: Date.now(),
        };
        const request = store.add(eventToStore);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async loadMaterializedViewCheckpoint({ viewName, partition }) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(MATERIALIZED_VIEW_STORE, "readonly");
        const store = transaction.objectStore(MATERIALIZED_VIEW_STORE);
        const request = store.get([viewName, partition]);
        request.onsuccess = (event) => {
          const row = event.target.result;
          if (!row) {
            resolve(undefined);
            return;
          }
          resolve({
            viewVersion: row.viewVersion,
            lastCommittedId: Number(row.lastCommittedId) || 0,
            value: structuredClone(row.value),
            updatedAt: Number(row.updatedAt) || 0,
          });
        };
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async saveMaterializedViewCheckpoint({
      viewName,
      partition,
      viewVersion,
      lastCommittedId,
      value,
      updatedAt,
    }) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          MATERIALIZED_VIEW_STORE,
          "readwrite",
        );
        const store = transaction.objectStore(MATERIALIZED_VIEW_STORE);
        const request = store.put({
          viewName,
          partition,
          viewVersion,
          lastCommittedId,
          value: structuredClone(value),
          updatedAt,
        });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
      });
    },

    async deleteMaterializedViewCheckpoint({ viewName, partition }) {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(
          MATERIALIZED_VIEW_STORE,
          "readwrite",
        );
        const store = transaction.objectStore(MATERIALIZED_VIEW_STORE);
        const request = store.delete([viewName, partition]);
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
