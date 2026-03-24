import { createIndexedDbClientStore } from "insieme/client";

const CLIENT_STORE_VERSION = "2";

const buildClientStoreDbName = (projectId) => {
  return `routevn-collab-client:${CLIENT_STORE_VERSION}:${projectId}`;
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
