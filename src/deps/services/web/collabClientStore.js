import { createIndexedDbClientStore } from "insieme/client";

const CLIENT_STORE_VERSION = "2";

export const buildClientStoreDbName = (projectId) => {
  return `routevn-collab-client:${CLIENT_STORE_VERSION}:${projectId}`;
};

const deleteDatabaseOnce = (name) =>
  new Promise((resolve) => {
    if (typeof name !== "string" || name.length === 0) {
      resolve(true);
      return;
    }

    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };

    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => finish(true);
    request.onerror = () => finish(false);
    request.onblocked = () => finish(false);
  });

export const deletePersistedInMemoryClientStore = async ({
  projectId,
  store,
} = {}) => {
  if (store && typeof store.close === "function") {
    await store.close().catch(() => {});
  }

  const dbName = buildClientStoreDbName(projectId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const deleted = await deleteDatabaseOnce(dbName);
    if (deleted) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 50 * (attempt + 1));
    });
  }

  throw new Error(`Failed to reset web client store '${dbName}'`);
};

export const createPersistedInMemoryClientStore = async ({
  projectId,
  materializedViews = [],
  logger = () => {},
}) => {
  const store = createIndexedDbClientStore({
    dbName: buildClientStoreDbName(projectId),
    materializedViews,
  });
  await store.init();

  logger({
    level: "debug",
    event: "collab_client_store_ready",
    projectId,
    dbName: buildClientStoreDbName(projectId),
  });

  return store;
};
