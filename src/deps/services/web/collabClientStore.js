import { createIndexedDBClientStore } from "insieme/client";

const buildClientStoreDbName = (projectId) => {
  return `routevn-collab-client:${projectId}`;
};

export const createPersistedInMemoryClientStore = async ({
  projectId,
  materializedViews = [],
  logger = () => {},
}) => {
  const store = createIndexedDBClientStore({
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
