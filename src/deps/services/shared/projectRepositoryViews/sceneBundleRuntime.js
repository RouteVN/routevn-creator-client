import { buildSceneOverview } from "../../../../internal/project/sceneOverview.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
  scenePartitionTokenFor,
} from "../collab/partitions.js";
import {
  OVERVIEW_CHECKPOINT_DEBOUNCE_MS,
  isMainPartition,
  isNonEmptyString,
} from "./shared.js";
import {
  deleteSceneOverviewCheckpoint,
  isSceneOverviewCheckpointFresh,
  loadSceneOverviewCheckpoint,
  loadSceneOverviewCheckpoints,
  saveSceneOverviewCheckpoint,
} from "./sceneOverviewStore.js";
import { composeRepositoryState } from "./sceneStateView.js";

const createOverviewEntry = ({
  value,
  lastCommittedId = 0,
  persistedLastCommittedId = 0,
  updatedAt = 0,
}) => ({
  value,
  lastCommittedId,
  persistedLastCommittedId,
  updatedAt,
  flushTimer: undefined,
});

const isDirty = (entry) =>
  entry.lastCommittedId > entry.persistedLastCommittedId;

const clearFlushTimer = (entry) => {
  if (!entry?.flushTimer) {
    return;
  }
  clearTimeout(entry.flushTimer);
  entry.flushTimer = undefined;
};

const cloneEntryValue = (entry) =>
  entry?.value ? structuredClone(entry.value) : undefined;

export const createSceneBundleRuntime = ({
  store,
  events,
  now = () => Date.now(),
  getCurrentRevision,
  getCurrentMainState,
  getLoadedSceneStates,
  loadSceneProjection,
  evictSceneProjection,
}) => {
  const sceneOverviewEntries = new Map();
  const latestSceneOverviewRevisionByToken = new Map();
  let globalSceneOverviewRevision = 0;

  const recordOverviewRevision = ({ partition, revision }) => {
    if (
      !isNonEmptyString(partition) ||
      !Number.isInteger(revision) ||
      revision <= 0
    ) {
      return;
    }

    if (isMainPartition(partition)) {
      globalSceneOverviewRevision = Math.max(
        globalSceneOverviewRevision,
        revision,
      );
      return;
    }

    if (!partition.startsWith("m:s:") && !partition.startsWith("s:")) {
      return;
    }

    const token = partition.startsWith("m:s:")
      ? partition.slice(4)
      : partition.slice(2);
    if (!token) {
      return;
    }

    latestSceneOverviewRevisionByToken.set(
      token,
      Math.max(latestSceneOverviewRevisionByToken.get(token) || 0, revision),
    );
  };

  for (let index = 0; index < events.length; index += 1) {
    recordOverviewRevision({
      partition: events[index]?.partition,
      revision: index + 1,
    });
  }

  const getLatestRelevantRevisionForScene = (sceneId) => {
    const token = scenePartitionTokenFor(sceneId);
    return Math.max(
      globalSceneOverviewRevision,
      latestSceneOverviewRevisionByToken.get(token) || 0,
    );
  };

  const persistEntry = async (sceneId, entry) => {
    if (!isDirty(entry)) {
      return;
    }

    await saveSceneOverviewCheckpoint({
      store,
      sceneId,
      value: entry.value,
      lastCommittedId: entry.lastCommittedId,
      updatedAt: entry.updatedAt || now(),
    });
    entry.persistedLastCommittedId = entry.lastCommittedId;
  };

  const scheduleFlush = (sceneId, entry) => {
    if (!isDirty(entry)) {
      return;
    }

    clearFlushTimer(entry);
    entry.flushTimer = setTimeout(() => {
      entry.flushTimer = undefined;
      void persistEntry(sceneId, entry);
    }, OVERVIEW_CHECKPOINT_DEBOUNCE_MS);
  };

  const setSceneOverviewEntry = ({
    sceneId,
    value,
    lastCommittedId,
    persistedLastCommittedId = lastCommittedId,
    updatedAt = now(),
  }) => {
    const entry =
      sceneOverviewEntries.get(sceneId) ||
      createOverviewEntry({
        value: structuredClone(value),
        lastCommittedId,
        persistedLastCommittedId,
        updatedAt,
      });

    entry.value = structuredClone(value);
    entry.lastCommittedId = lastCommittedId;
    entry.persistedLastCommittedId = persistedLastCommittedId;
    entry.updatedAt = updatedAt;
    sceneOverviewEntries.set(sceneId, entry);
    return entry;
  };

  const removeSceneOverview = async (sceneId) => {
    const entry = sceneOverviewEntries.get(sceneId);
    if (entry) {
      clearFlushTimer(entry);
      sceneOverviewEntries.delete(sceneId);
    }
    await deleteSceneOverviewCheckpoint({ store, sceneId });
  };

  const buildAndStoreSceneOverview = async ({
    sceneId,
    keepSceneLoaded = false,
  }) => {
    const loadedSceneStates = getLoadedSceneStates();
    const hadLoadedScene = loadedSceneStates.has(sceneId);
    let sceneState = loadedSceneStates.get(sceneId);

    if (!sceneState) {
      sceneState = await loadSceneProjection(sceneId);
      loadedSceneStates.set(sceneId, sceneState);
    }

    const overview = buildSceneOverview({
      repositoryState: composeRepositoryState({
        mainState: getCurrentMainState(),
        sceneStatesBySceneId: new Map([[sceneId, sceneState]]),
      }),
      sceneId,
    });

    if (!overview) {
      if (!hadLoadedScene && !keepSceneLoaded) {
        await evictSceneProjection(sceneId);
      }
      await removeSceneOverview(sceneId);
      return undefined;
    }

    const entry = setSceneOverviewEntry({
      sceneId,
      value: overview,
      lastCommittedId: getLatestRelevantRevisionForScene(sceneId),
      persistedLastCommittedId: 0,
      updatedAt: now(),
    });

    if (!hadLoadedScene && !keepSceneLoaded) {
      await persistEntry(sceneId, entry);
      await evictSceneProjection(sceneId);
    } else {
      scheduleFlush(sceneId, entry);
    }

    return cloneEntryValue(entry);
  };

  const ensureSceneOverview = async ({ sceneId, keepSceneLoaded = false }) => {
    if (!isNonEmptyString(sceneId)) {
      return undefined;
    }

    const sceneExists = Boolean(
      getCurrentMainState()?.scenes?.items?.[sceneId],
    );
    if (!sceneExists) {
      await removeSceneOverview(sceneId);
      return undefined;
    }

    const latestRelevantRevision = getLatestRelevantRevisionForScene(sceneId);
    const hotEntry = sceneOverviewEntries.get(sceneId);
    if (hotEntry && hotEntry.lastCommittedId === latestRelevantRevision) {
      return cloneEntryValue(hotEntry);
    }

    const checkpoint = await loadSceneOverviewCheckpoint({ store, sceneId });
    if (
      isSceneOverviewCheckpointFresh({
        checkpoint,
        latestRelevantRevision,
      })
    ) {
      setSceneOverviewEntry({
        sceneId,
        value: checkpoint.value,
        lastCommittedId: latestRelevantRevision,
        persistedLastCommittedId: latestRelevantRevision,
        updatedAt: checkpoint.updatedAt || now(),
      });
      return structuredClone(checkpoint.value);
    }

    return buildAndStoreSceneOverview({
      sceneId,
      keepSceneLoaded,
    });
  };

  const ensureSceneOverviewWithCheckpoint = async ({
    sceneId,
    keepSceneLoaded = false,
    checkpoint,
  }) => {
    if (!isNonEmptyString(sceneId)) {
      return undefined;
    }

    const sceneExists = Boolean(
      getCurrentMainState()?.scenes?.items?.[sceneId],
    );
    if (!sceneExists) {
      await removeSceneOverview(sceneId);
      return undefined;
    }

    const latestRelevantRevision = getLatestRelevantRevisionForScene(sceneId);
    const hotEntry = sceneOverviewEntries.get(sceneId);
    if (hotEntry && hotEntry.lastCommittedId === latestRelevantRevision) {
      return cloneEntryValue(hotEntry);
    }

    if (
      isSceneOverviewCheckpointFresh({
        checkpoint,
        latestRelevantRevision,
      })
    ) {
      setSceneOverviewEntry({
        sceneId,
        value: checkpoint.value,
        lastCommittedId: latestRelevantRevision,
        persistedLastCommittedId: latestRelevantRevision,
        updatedAt: checkpoint.updatedAt || now(),
      });
      return structuredClone(checkpoint.value);
    }

    return buildAndStoreSceneOverview({
      sceneId,
      keepSceneLoaded,
    });
  };

  const refreshLoadedSceneOverviews = async ({ partitions = [] } = {}) => {
    const loadedSceneStates = getLoadedSceneStates();
    if (loadedSceneStates.size === 0) {
      return;
    }

    const affectedSceneIds = new Set();
    for (const partition of partitions) {
      if (isMainPartition(partition)) {
        for (const sceneId of loadedSceneStates.keys()) {
          affectedSceneIds.add(sceneId);
        }
        continue;
      }

      for (const sceneId of loadedSceneStates.keys()) {
        if (
          partition === scenePartitionFor(sceneId) ||
          partition === mainScenePartitionFor(sceneId)
        ) {
          affectedSceneIds.add(sceneId);
        }
      }
    }

    for (const sceneId of affectedSceneIds) {
      await buildAndStoreSceneOverview({
        sceneId,
        keepSceneLoaded: true,
      });
    }
  };

  return {
    getSceneOverview(sceneId) {
      return cloneEntryValue(sceneOverviewEntries.get(sceneId));
    },

    async ensureSceneBundle(sceneId, { keepSceneLoaded = false } = {}) {
      return ensureSceneOverview({
        sceneId,
        keepSceneLoaded,
      });
    },

    async loadSceneOverviews({ sceneIds = [] } = {}) {
      const overviewsBySceneId = {};
      const checkpointsBySceneId = await loadSceneOverviewCheckpoints({
        store,
        sceneIds,
      });

      for (const sceneId of sceneIds) {
        const overview = await ensureSceneOverviewWithCheckpoint({
          sceneId,
          checkpoint: checkpointsBySceneId.get(sceneId),
        });
        if (overview) {
          overviewsBySceneId[sceneId] = overview;
        }
      }

      return overviewsBySceneId;
    },

    async handleCommittedEvents(sourceEvents = []) {
      const committedEvents = Array.isArray(sourceEvents)
        ? sourceEvents.filter(Boolean)
        : [];
      if (committedEvents.length === 0) {
        return;
      }

      committedEvents.forEach((event) => {
        recordOverviewRevision({
          partition: event.partition,
          revision: event.committedId || getCurrentRevision(),
        });
      });

      await refreshLoadedSceneOverviews({
        partitions: committedEvents.map((event) => event.partition),
      });
    },

    async flushSceneOverviews() {
      const entries = [...sceneOverviewEntries.entries()];
      for (const [sceneId, entry] of entries) {
        clearFlushTimer(entry);
        await persistEntry(sceneId, entry);
      }
    },

    async clearSceneOverview(sceneId) {
      await removeSceneOverview(sceneId);
    },

    async clearAllSceneOverviews() {
      for (const sceneId of sceneOverviewEntries.keys()) {
        await removeSceneOverview(sceneId);
      }
    },
  };
};
