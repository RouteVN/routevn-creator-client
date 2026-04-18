import { buildSceneOverview } from "../../../../internal/project/sceneOverview.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../collab/partitions.js";
import {
  doesCommittedEventAffectSceneOverview,
  getCommittedEventRevision,
  iterateCommittedEventBatches,
  isMainPartition,
  isNonEmptyString,
  OVERVIEW_CHECKPOINT_DEBOUNCE_MS,
  resolveSceneIdForPartition,
} from "./shared.js";
import { composeRepositoryState } from "./sceneStateView.js";
import {
  deleteSceneOverviewCheckpoint,
  deleteSceneOverviewCheckpointByPartition,
  isSceneOverviewCheckpointFresh,
  loadSceneOverviewCheckpoint,
  loadSceneOverviewCheckpoints,
  saveSceneOverviewCheckpoint,
} from "./sceneOverviewStore.js";

export const createSceneBundleRuntime = ({
  store,
  listCommittedAfter,
  now = () => Date.now(),
  getCurrentMainState,
  getActiveSceneId,
  getActiveSceneState,
  loadSceneProjection,
}) => {
  const getLatestOverviewRevisionForScene = async (sceneId) => {
    const scenePartition = scenePartitionFor(sceneId);
    const mainScenePartition = mainScenePartitionFor(sceneId);
    let latestRelevantRevision = 0;

    for await (const committedBatch of iterateCommittedEventBatches({
      listCommittedAfter,
    })) {
      for (const event of committedBatch) {
        const partition = event?.partition;
        const revision = getCommittedEventRevision(event);

        if (partition === scenePartition || partition === mainScenePartition) {
          latestRelevantRevision = revision;
          continue;
        }

        if (
          isMainPartition(partition) &&
          doesCommittedEventAffectSceneOverview(event)
        ) {
          latestRelevantRevision = revision;
        }
      }
    }

    return latestRelevantRevision;
  };

  const getSceneStateForOverview = async (sceneId) => {
    const activeSceneId = getActiveSceneId();
    const activeSceneState = getActiveSceneState();
    if (sceneId === activeSceneId && activeSceneState) {
      return activeSceneState;
    }

    return loadSceneProjection(sceneId);
  };

  let scheduledOverviewFlushId;
  let overviewCheckpointWriteChain = Promise.resolve();
  const pendingOverviewDeletes = new Set();
  const pendingOverviewSavesBySceneId = new Map();

  const flushPendingOverviewWrites = ({ throwOnError = false } = {}) => {
    const queuedDeletes = [...pendingOverviewDeletes];
    const queuedSaves = [...pendingOverviewSavesBySceneId.values()];
    pendingOverviewDeletes.clear();
    pendingOverviewSavesBySceneId.clear();

    if (queuedDeletes.length === 0 && queuedSaves.length === 0) {
      return overviewCheckpointWriteChain;
    }

    const operation = overviewCheckpointWriteChain.then(async () => {
      for (const partition of queuedDeletes) {
        await deleteSceneOverviewCheckpointByPartition({
          store,
          partition,
        });
      }

      for (const checkpoint of queuedSaves) {
        await saveSceneOverviewCheckpoint({
          store,
          sceneId: checkpoint.sceneId,
          value: checkpoint.value,
          lastCommittedId: checkpoint.lastCommittedId,
          updatedAt: checkpoint.updatedAt,
        });
      }
    });

    overviewCheckpointWriteChain = operation.catch((error) => {
      console.warn("Failed to persist scene overview checkpoints:", error);
    });

    if (throwOnError) {
      return operation;
    }

    return overviewCheckpointWriteChain;
  };

  const scheduleOverviewWriteFlush = () => {
    if (scheduledOverviewFlushId !== undefined) {
      return;
    }

    scheduledOverviewFlushId = globalThis.setTimeout(() => {
      scheduledOverviewFlushId = undefined;
      void flushPendingOverviewWrites();
    }, OVERVIEW_CHECKPOINT_DEBOUNCE_MS);
  };

  const queueSceneOverviewSave = ({ sceneId, overview, lastCommittedId }) => {
    if (!isNonEmptyString(sceneId) || overview === undefined) {
      return;
    }

    const partition = scenePartitionFor(sceneId);
    pendingOverviewDeletes.delete(partition);
    pendingOverviewSavesBySceneId.set(sceneId, {
      sceneId,
      value: structuredClone(overview),
      lastCommittedId,
      updatedAt: now(),
    });
    scheduleOverviewWriteFlush();
  };

  const queueSceneOverviewDelete = ({ sceneId, partition }) => {
    const normalizedPartition =
      partition ||
      (isNonEmptyString(sceneId) ? scenePartitionFor(sceneId) : undefined);
    if (!isNonEmptyString(normalizedPartition)) {
      return;
    }

    if (isNonEmptyString(sceneId)) {
      pendingOverviewSavesBySceneId.delete(sceneId);
    }
    pendingOverviewDeletes.add(normalizedPartition);
    scheduleOverviewWriteFlush();
  };

  const buildAndStoreSceneOverview = async ({ sceneId, checkpoint = null }) => {
    if (!isNonEmptyString(sceneId)) {
      return undefined;
    }

    const currentMainState = getCurrentMainState();
    const sceneExists = Boolean(currentMainState?.scenes?.items?.[sceneId]);
    if (!sceneExists) {
      if (checkpoint) {
        queueSceneOverviewDelete({ sceneId });
      }
      return undefined;
    }

    const sceneState = await getSceneStateForOverview(sceneId);
    const overview = buildSceneOverview({
      repositoryState: composeRepositoryState({
        mainState: currentMainState,
        activeSceneId: sceneId,
        activeSceneState: sceneState,
      }),
      sceneId,
    });

    if (!overview) {
      queueSceneOverviewDelete({ sceneId });
      return undefined;
    }

    queueSceneOverviewSave({
      sceneId,
      overview,
      lastCommittedId: await getLatestOverviewRevisionForScene(sceneId),
    });

    return structuredClone(overview);
  };

  const ensureSceneOverviewWithCheckpoint = async ({
    sceneId,
    checkpoint = null,
  }) => {
    if (!isNonEmptyString(sceneId)) {
      return undefined;
    }

    const currentMainState = getCurrentMainState();
    const sceneExists = Boolean(currentMainState?.scenes?.items?.[sceneId]);
    if (!sceneExists) {
      if (checkpoint) {
        queueSceneOverviewDelete({ sceneId });
      }
      return undefined;
    }

    if (sceneId === getActiveSceneId() && getActiveSceneState()) {
      return buildAndStoreSceneOverview({
        sceneId,
        checkpoint,
      });
    }

    const latestRelevantRevision =
      await getLatestOverviewRevisionForScene(sceneId);
    if (
      isSceneOverviewCheckpointFresh({
        checkpoint,
        latestRelevantRevision,
      })
    ) {
      return structuredClone(checkpoint.value);
    }

    return buildAndStoreSceneOverview({
      sceneId,
      checkpoint,
    });
  };

  const invalidateInactiveSceneOverviews = async () => {
    const activeSceneId = getActiveSceneId();
    const currentSceneIds = Object.keys(
      getCurrentMainState()?.scenes?.items || {},
    );

    for (const sceneId of currentSceneIds) {
      if (sceneId === activeSceneId) {
        continue;
      }
      queueSceneOverviewDelete({ sceneId });
    }
  };

  return {
    getSceneOverview(_sceneId) {
      return undefined;
    },

    async ensureSceneBundle(sceneId) {
      return ensureSceneOverviewWithCheckpoint({
        sceneId,
        checkpoint: await loadSceneOverviewCheckpoint({ store, sceneId }),
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

      const activeSceneId = getActiveSceneId();
      const scenesToRebuild = new Set();
      const inactivePartitionsToDelete = new Set();
      let sawMainEvent = false;

      for (const event of committedEvents) {
        const partition = event?.partition;
        if (!isNonEmptyString(partition)) {
          continue;
        }

        if (isMainPartition(partition)) {
          if (!doesCommittedEventAffectSceneOverview(event)) {
            continue;
          }
          sawMainEvent = true;
          if (activeSceneId) {
            scenesToRebuild.add(activeSceneId);
          }
          continue;
        }

        const sceneId = resolveSceneIdForPartition(
          getCurrentMainState(),
          partition,
        );
        if (sceneId && sceneId === activeSceneId) {
          scenesToRebuild.add(sceneId);
          continue;
        }

        if (partition.startsWith("m:s:") || partition.startsWith("s:")) {
          inactivePartitionsToDelete.add(partition);
        }
      }

      if (sawMainEvent) {
        await invalidateInactiveSceneOverviews();
      }

      for (const partition of inactivePartitionsToDelete) {
        queueSceneOverviewDelete({ partition });
      }

      for (const sceneId of scenesToRebuild) {
        await buildAndStoreSceneOverview({
          sceneId,
        });
      }
    },

    async flushSceneOverviews() {
      if (scheduledOverviewFlushId !== undefined) {
        globalThis.clearTimeout(scheduledOverviewFlushId);
        scheduledOverviewFlushId = undefined;
      }

      await flushPendingOverviewWrites({
        throwOnError: true,
      });
      await overviewCheckpointWriteChain;
    },

    async clearSceneOverview(sceneId) {
      pendingOverviewSavesBySceneId.delete(sceneId);
      pendingOverviewDeletes.delete(scenePartitionFor(sceneId));
      await deleteSceneOverviewCheckpoint({ store, sceneId });
    },

    async clearAllSceneOverviews() {
      for (const sceneId of Object.keys(
        getCurrentMainState()?.scenes?.items || {},
      )) {
        pendingOverviewSavesBySceneId.delete(sceneId);
        pendingOverviewDeletes.delete(scenePartitionFor(sceneId));
        await deleteSceneOverviewCheckpoint({ store, sceneId });
      }
    },
  };
};
