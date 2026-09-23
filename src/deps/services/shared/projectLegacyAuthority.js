import { createProjectRepository } from "./projectRepository.js";
import {
  areRepositoryHistoryStatsEqual,
  loadRepositoryEventsFromClientStore,
} from "./collab/clientStoreHistory.js";
import { digestProjectValue, projectHistoryStats } from "./projectAuthority.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
} from "./projectRepositoryViews/shared.js";

// Run the previous reader against an immutable prefix. Any cache rebuilding it
// performs stays in this overlay: original recovery sources are never rewritten.
export const resolveLegacyProjectAuthority = async ({
  store,
  projectId,
  history,
  historyOnly = false,
  persistDerivedCaches = false,
}) => {
  const historyStats = projectHistoryStats(history);
  const revision = history.committed.length + history.drafts.length;
  const checkpoints = new Map();
  const originalCheckpoints = new Map();
  const keyFor = ({ viewName, partition }) =>
    JSON.stringify([viewName, partition]);
  const loadCheckpoint = async (query) => {
    const key = keyFor(query);
    if (!checkpoints.has(key)) {
      const value = await store.loadMaterializedViewCheckpoint(query);
      originalCheckpoints.set(key, value);
      checkpoints.set(key, value);
    }
    return structuredClone(checkpoints.get(key));
  };
  const mainQuery = { viewName: MAIN_VIEW_NAME, partition: MAIN_PARTITION };
  const checkpoint = await loadCheckpoint(mainQuery);
  const fresh =
    checkpoint?.viewVersion === MAIN_VIEW_VERSION &&
    (checkpoint.meta?.historyStats
      ? areRepositoryHistoryStatsEqual(
          checkpoint.meta.historyStats,
          historyStats,
        )
      : Number(checkpoint.lastCommittedId) === revision);
  if (!fresh) checkpoints.set(keyFor(mainQuery), undefined);

  const snapshot = {
    listCommittedAfter: async ({
      sinceCommittedId = 0,
      limit = 500,
      partition,
    } = {}) =>
      structuredClone(
        history.committed
          .filter(
            (record) =>
              record.committedId > sinceCommittedId &&
              (partition === undefined || record.partition === partition),
          )
          .slice(0, limit),
      ),
    listDraftsOrdered: async () => structuredClone(history.drafts),
    getRepositoryHistoryStats: async () => ({ ...historyStats }),
    isRepositoryHistoryStatsEqual: areRepositoryHistoryStatsEqual,
    loadMaterializedViewCheckpoint: loadCheckpoint,
    loadMaterializedViewCheckpoints: async ({ viewName, partitions }) => {
      const values = await Promise.all(
        partitions.map((partition) => loadCheckpoint({ viewName, partition })),
      );
      return values.filter(Boolean);
    },
    saveMaterializedViewCheckpoint: async (value) => {
      checkpoints.set(keyFor(value), structuredClone(value));
      if (persistDerivedCaches)
        await store.saveMaterializedViewCheckpoint(value);
    },
    deleteMaterializedViewCheckpoint: async (query) => {
      checkpoints.set(keyFor(query), undefined);
      if (persistDerivedCaches)
        await store.deleteMaterializedViewCheckpoint(query);
    },
  };
  const repository = await createProjectRepository({
    projectId,
    store: snapshot,
    initialRevision: revision,
    historyStats,
    loadEvents: () =>
      loadRepositoryEventsFromClientStore({ store: snapshot, projectId }),
  });
  const sceneIds = Object.keys(repository.getState().scenes.items);
  const state = historyOnly
    ? await repository.loadState()
    : await repository.getContextState({ sceneIds });
  await repository.flushMaterializedViews();
  return {
    state,
    recovery: Boolean(
      fresh &&
        !history.committed.length &&
        !history.drafts.some((record) => record.type === "project.create"),
    ),
    recoverySourceDigest: digestProjectValue([
      ...originalCheckpoints.entries(),
    ]),
  };
};
