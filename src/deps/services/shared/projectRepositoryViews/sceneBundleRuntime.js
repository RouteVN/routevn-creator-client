import { buildSceneOverview } from "../../../../internal/project/sceneOverview.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../collab/partitions.js";
import { committedEventToCommand } from "../collab/mappers.js";
import {
  doesCommittedEventAffectSceneOverview,
  doesCommittedEventAffectSceneTextStats,
  getCommittedEventRevision,
  iterateCommittedEventBatches,
  isMainPartition,
  isNonEmptyString,
  OVERVIEW_CHECKPOINT_DEBOUNCE_MS,
  resolveSceneIdForPartition,
  SCENE_OVERVIEW_VIEW_VERSION,
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
import {
  deleteSceneTextStatsCheckpoint,
  isSceneTextStatsCheckpointFresh,
  loadSceneTextStatsCheckpoints,
  saveSceneTextStatsCheckpoint,
} from "./sceneTextStatsStore.js";

export const createSceneBundleRuntime = ({
  store,
  listCommittedAfter,
  now = () => Date.now(),
  getCurrentMainState,
  getCurrentRevision = () => Number.MAX_SAFE_INTEGER,
  getCurrentHistoryStats = () => undefined,
  getActiveSceneId,
  getActiveSceneState,
  loadSceneProjection,
}) => {
  const normalizeHistoryStat = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
      ? Math.max(0, Math.floor(numericValue))
      : 0;
  };

  const normalizeHistoryStats = (stats) => ({
    committedCount: normalizeHistoryStat(stats?.committedCount),
    latestCommittedId: normalizeHistoryStat(stats?.latestCommittedId),
    draftCount: normalizeHistoryStat(stats?.draftCount),
    latestDraftClock: normalizeHistoryStat(stats?.latestDraftClock),
  });

  const isCheckpointHistoryCompatible = (checkpoint) => {
    const currentHistoryStats = getCurrentHistoryStats();
    if (!currentHistoryStats) {
      return true;
    }

    const checkpointHistoryStats = checkpoint?.meta?.historyStats;
    if (!checkpointHistoryStats) {
      return false;
    }

    const current = normalizeHistoryStats(currentHistoryStats);
    const saved = normalizeHistoryStats(checkpointHistoryStats);
    if (saved.draftCount > 0) {
      return (
        saved.committedCount === current.committedCount &&
        saved.latestCommittedId === current.latestCommittedId &&
        saved.draftCount === current.draftCount &&
        saved.latestDraftClock === current.latestDraftClock
      );
    }

    if (current.committedCount < saved.committedCount) {
      return false;
    }

    if (current.committedCount === saved.committedCount) {
      return current.latestCommittedId === saved.latestCommittedId;
    }

    return current.latestCommittedId > saved.latestCommittedId;
  };

  const getCheckpointRevision = (checkpoint) => {
    if (
      checkpoint?.viewVersion !== SCENE_OVERVIEW_VIEW_VERSION ||
      !isCheckpointHistoryCompatible(checkpoint)
    ) {
      return 0;
    }

    const checkpointRevision = Number(checkpoint.lastCommittedId);
    const currentRevision = Number(getCurrentRevision());
    if (
      !Number.isFinite(checkpointRevision) ||
      checkpointRevision < 0 ||
      (Number.isFinite(currentRevision) && checkpointRevision > currentRevision)
    ) {
      return 0;
    }

    return Math.floor(checkpointRevision);
  };

  const getLatestOverviewRevisionForScene = async (sceneId, checkpoint) => {
    const scenePartition = scenePartitionFor(sceneId);
    const mainScenePartition = mainScenePartitionFor(sceneId);
    const sinceCommittedId = getCheckpointRevision(checkpoint);
    let latestRelevantRevision = sinceCommittedId;

    for await (const committedBatch of iterateCommittedEventBatches({
      listCommittedAfter,
      sinceCommittedId,
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

  const getLatestOverviewRevisionsForScenes = async ({
    sceneIds = [],
    checkpointsBySceneId = new Map(),
  } = {}) => {
    const normalizedSceneIds = sceneIds.filter(isNonEmptyString);
    const revisionsBySceneId = new Map(
      normalizedSceneIds.map((sceneId) => [
        sceneId,
        getCheckpointRevision(checkpointsBySceneId.get(sceneId)),
      ]),
    );
    if (normalizedSceneIds.length === 0) {
      return revisionsBySceneId;
    }

    const sceneIdByPartition = new Map();
    for (const sceneId of normalizedSceneIds) {
      sceneIdByPartition.set(scenePartitionFor(sceneId), sceneId);
      sceneIdByPartition.set(mainScenePartitionFor(sceneId), sceneId);
    }

    let latestRelevantMainRevision = 0;
    let sinceCommittedId = Number.MAX_SAFE_INTEGER;
    for (const revision of revisionsBySceneId.values()) {
      sinceCommittedId = Math.min(sinceCommittedId, revision);
    }

    for await (const committedBatch of iterateCommittedEventBatches({
      listCommittedAfter,
      sinceCommittedId,
    })) {
      for (const event of committedBatch) {
        const partition = event?.partition;
        const revision = getCommittedEventRevision(event);
        const sceneId = sceneIdByPartition.get(partition);

        if (sceneId) {
          revisionsBySceneId.set(
            sceneId,
            Math.max(revisionsBySceneId.get(sceneId) || 0, revision),
          );
          continue;
        }

        if (
          isMainPartition(partition) &&
          doesCommittedEventAffectSceneOverview(event)
        ) {
          latestRelevantMainRevision = revision;
        }
      }
    }

    if (latestRelevantMainRevision > 0) {
      for (const sceneId of normalizedSceneIds) {
        revisionsBySceneId.set(
          sceneId,
          Math.max(
            revisionsBySceneId.get(sceneId) || 0,
            latestRelevantMainRevision,
          ),
        );
      }
    }

    return revisionsBySceneId;
  };

  const getTextStatsCheckpointRevision = (checkpoint) => {
    if (!isCheckpointHistoryCompatible(checkpoint)) {
      return 0;
    }

    const checkpointRevision = Number(checkpoint?.lastCommittedId);
    const currentRevision = Number(getCurrentRevision());
    if (
      !Number.isFinite(checkpointRevision) ||
      checkpointRevision < 0 ||
      (Number.isFinite(currentRevision) && checkpointRevision > currentRevision)
    ) {
      return 0;
    }

    return Math.floor(checkpointRevision);
  };

  const getLatestTextStatsRevisionsForScenes = async ({
    checkpointsBySceneId = new Map(),
  } = {}) => {
    const normalizedSceneIds = [...checkpointsBySceneId.keys()].filter(
      isNonEmptyString,
    );
    const revisionsBySceneId = new Map(
      normalizedSceneIds.map((sceneId) => [
        sceneId,
        getTextStatsCheckpointRevision(checkpointsBySceneId.get(sceneId)),
      ]),
    );
    if (normalizedSceneIds.length === 0) {
      return revisionsBySceneId;
    }

    const requestedSceneIds = new Set(normalizedSceneIds);
    const sceneIdByPartition = new Map();
    for (const sceneId of normalizedSceneIds) {
      sceneIdByPartition.set(scenePartitionFor(sceneId), sceneId);
      sceneIdByPartition.set(mainScenePartitionFor(sceneId), sceneId);
    }

    let sinceCommittedId = Number.MAX_SAFE_INTEGER;
    for (const revision of revisionsBySceneId.values()) {
      sinceCommittedId = Math.min(sinceCommittedId, revision);
    }

    for await (const committedBatch of iterateCommittedEventBatches({
      listCommittedAfter,
      sinceCommittedId,
    })) {
      for (const event of committedBatch) {
        if (!doesCommittedEventAffectSceneTextStats(event)) {
          continue;
        }

        const revision = getCommittedEventRevision(event);
        const partitionSceneId = sceneIdByPartition.get(event?.partition);
        if (partitionSceneId) {
          revisionsBySceneId.set(
            partitionSceneId,
            Math.max(revisionsBySceneId.get(partitionSceneId) || 0, revision),
          );
        }

        const command = committedEventToCommand(event);
        for (const sceneId of command?.payload?.sceneIds ?? []) {
          if (!requestedSceneIds.has(sceneId)) {
            continue;
          }
          revisionsBySceneId.set(
            sceneId,
            Math.max(revisionsBySceneId.get(sceneId) || 0, revision),
          );
        }
      }
    }

    return revisionsBySceneId;
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

  const buildAndStoreSceneOverview = async ({
    sceneId,
    checkpoint = null,
    latestRelevantRevision,
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

    const sceneState = await getSceneStateForOverview(sceneId);

    const repositoryState = composeRepositoryState({
      mainState: currentMainState,
      activeSceneId: sceneId,
      activeSceneState: sceneState,
    });

    const overview = buildSceneOverview({
      repositoryState,
      sceneId,
    });

    if (!overview) {
      queueSceneOverviewDelete({ sceneId });
      return undefined;
    }

    queueSceneOverviewSave({
      sceneId,
      overview,
      lastCommittedId: Number.isFinite(latestRelevantRevision)
        ? latestRelevantRevision
        : await getLatestOverviewRevisionForScene(sceneId, checkpoint),
    });

    return structuredClone(overview);
  };

  const ensureSceneOverviewWithCheckpoint = async ({
    sceneId,
    checkpoint = null,
    latestRelevantRevision,
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
        latestRelevantRevision,
      });
    }

    const resolvedLatestRelevantRevision = Number.isFinite(
      latestRelevantRevision,
    )
      ? latestRelevantRevision
      : await getLatestOverviewRevisionForScene(sceneId, checkpoint);
    if (
      isCheckpointHistoryCompatible(checkpoint) &&
      isSceneOverviewCheckpointFresh({
        checkpoint,
        latestRelevantRevision: resolvedLatestRelevantRevision,
      })
    ) {
      return structuredClone(checkpoint.value);
    }

    return buildAndStoreSceneOverview({
      sceneId,
      checkpoint,
      latestRelevantRevision: resolvedLatestRelevantRevision,
    });
  };

  const cacheSceneTextStats = async ({ sceneId, textStats } = {}) => {
    if (
      !isNonEmptyString(sceneId) ||
      !textStats ||
      typeof textStats !== "object"
    ) {
      return undefined;
    }

    if (!getCurrentMainState()?.scenes?.items?.[sceneId]) {
      return undefined;
    }

    const cachedTextStats = structuredClone(textStats);
    await saveSceneTextStatsCheckpoint({
      store,
      sceneId,
      value: cachedTextStats,
      lastCommittedId: getCurrentRevision(),
      updatedAt: now(),
    });

    return cachedTextStats;
  };

  const loadSceneTextStats = async ({ sceneIds = [] } = {}) => {
    const checkpointsBySceneId = await loadSceneTextStatsCheckpoints({
      store,
      sceneIds,
    });

    const latestRevisionsBySceneId = await getLatestTextStatsRevisionsForScenes(
      {
        checkpointsBySceneId,
      },
    );

    const textStatsBySceneId = {};
    const staleSceneIds = [];
    for (const [sceneId, checkpoint] of checkpointsBySceneId) {
      if (
        isCheckpointHistoryCompatible(checkpoint) &&
        isSceneTextStatsCheckpointFresh({
          checkpoint,
          latestRelevantRevision: latestRevisionsBySceneId.get(sceneId),
        })
      ) {
        textStatsBySceneId[sceneId] = structuredClone(checkpoint.value);
        continue;
      }

      staleSceneIds.push(sceneId);
    }

    await Promise.all(
      staleSceneIds.map((sceneId) =>
        deleteSceneTextStatsCheckpoint({ store, sceneId }),
      ),
    );

    return textStatsBySceneId;
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

      const latestRevisionsBySceneId =
        await getLatestOverviewRevisionsForScenes({
          sceneIds,
          checkpointsBySceneId,
        });

      for (const sceneId of sceneIds) {
        const checkpoint = checkpointsBySceneId.get(sceneId);
        const latestRelevantRevision = latestRevisionsBySceneId.get(sceneId);

        const overview = await ensureSceneOverviewWithCheckpoint({
          sceneId,
          checkpoint,
          latestRelevantRevision,
        });
        if (overview) {
          overviewsBySceneId[sceneId] = overview;
        }
      }

      return overviewsBySceneId;
    },

    cacheSceneTextStats,
    loadSceneTextStats,

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
      const sceneTextStatsIdsToDelete = new Set();
      let sawMainEvent = false;

      for (const event of committedEvents) {
        const partition = event?.partition;
        if (!isNonEmptyString(partition)) {
          continue;
        }

        if (doesCommittedEventAffectSceneTextStats(event)) {
          const command = committedEventToCommand(event);
          const textStatsSceneId = resolveSceneIdForPartition(
            getCurrentMainState(),
            partition,
          );
          if (textStatsSceneId) {
            sceneTextStatsIdsToDelete.add(textStatsSceneId);
          }
          for (const sceneId of command?.payload?.sceneIds ?? []) {
            if (isNonEmptyString(sceneId)) {
              sceneTextStatsIdsToDelete.add(sceneId);
            }
          }
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

      for (const sceneId of sceneTextStatsIdsToDelete) {
        await deleteSceneTextStatsCheckpoint({ store, sceneId });
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
      await Promise.all([
        deleteSceneOverviewCheckpoint({ store, sceneId }),
        deleteSceneTextStatsCheckpoint({ store, sceneId }),
      ]);
    },

    async clearAllSceneOverviews() {
      for (const sceneId of Object.keys(
        getCurrentMainState()?.scenes?.items || {},
      )) {
        pendingOverviewSavesBySceneId.delete(sceneId);
        pendingOverviewDeletes.delete(scenePartitionFor(sceneId));
        await Promise.all([
          deleteSceneOverviewCheckpoint({ store, sceneId }),
          deleteSceneTextStatsCheckpoint({ store, sceneId }),
        ]);
      }
    },
  };
};
