import { SCHEMA_VERSION } from "@routevn/creator-model";
import {
  createPersistedInMemoryClientStore,
  buildClientStoreDbName,
} from "../../src/deps/services/web/collabClientStore.js";
import { createInsiemeWebStoreAdapter } from "../../src/deps/clients/web/webRepositoryAdapter.js";
import { createWebProjectAcceptanceLease } from "../../src/deps/clients/web/projectAcceptanceLock.js";
import { createAcceptedProjectRepository } from "../../src/deps/services/shared/acceptedProjectRepository.js";

window.openStrictProject = async (projectId) => {
  if (SCHEMA_VERSION !== 16)
    throw new Error("Strict browser tests require model schema 16");
  const raw = await createPersistedInMemoryClientStore({ projectId });
  const store = await createInsiemeWebStoreAdapter(projectId, {
    rawClientStore: raw,
  });
  const repository = await createAcceptedProjectRepository({
    reference: {
      projectId,
      repositoryProjectId: projectId,
      cacheKey: projectId,
    },
    store,
    lease: createWebProjectAcceptanceLease({
      databaseName: buildClientStoreDbName(projectId),
    }),
    isCurrent: () => true,
    generateId: () => crypto.randomUUID(),
  });
  const actor = { userId: "user-one", clientId: "client-one" };
  window.strictProject = {
    submit: (requests) => repository.submitCommands(requests, actor),
    state: () => repository.getContextState(),
    drafts: () => raw.listDraftsOrdered(),
    close: () => repository.close(),
  };
};
