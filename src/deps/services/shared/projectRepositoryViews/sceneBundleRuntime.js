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

const SCENE_OVERVIEW_PERF_PREFIX = "[rvn.scene-overview-perf]";

const getSceneOverviewTimingNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

const getSceneOverviewDurationMs = (startedAt) => {
  return Number((getSceneOverviewTimingNow() - startedAt).toFixed(2));
};

const logSceneOverviewTiming = (event, data = {}) => {
  const entry = {
    event,
    ts: Number(getSceneOverviewTimingNow().toFixed(2)),
    ...data,
  };

  try {
    console.info(`${SCENE_OVERVIEW_PERF_PREFIX} ${JSON.stringify(entry)}`);
  } catch {
    console.info(SCENE_OVERVIEW_PERF_PREFIX, entry);
  }
};

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
    const startedAt = getSceneOverviewTimingNow();
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
    let committedBatchCount = 0;
    let committedEventCount = 0;
    let sinceCommittedId = Number.MAX_SAFE_INTEGER;
    for (const revision of revisionsBySceneId.values()) {
      sinceCommittedId = Math.min(sinceCommittedId, revision);
    }

    for await (const committedBatch of iterateCommittedEventBatches({
      listCommittedAfter,
      sinceCommittedId,
    })) {
      committedBatchCount += 1;
      committedEventCount += committedBatch.length;
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

    logSceneOverviewTiming("revision-scan.complete", {
      durationMs: getSceneOverviewDurationMs(startedAt),
      sceneCount: normalizedSceneIds.length,
      committedBatchCount,
      committedEventCount,
      sinceCommittedId,
      latestRelevantMainRevision,
    });

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
    const startedAt = getSceneOverviewTimingNow();
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

    let phaseStartedAt = getSceneOverviewTimingNow();
    const sceneState = await getSceneStateForOverview(sceneId);
    const loadSceneStateMs = getSceneOverviewDurationMs(phaseStartedAt);

    phaseStartedAt = getSceneOverviewTimingNow();
    const repositoryState = composeRepositoryState({
      mainState: currentMainState,
      activeSceneId: sceneId,
      activeSceneState: sceneState,
    });
    const composeRepositoryStateMs = getSceneOverviewDurationMs(phaseStartedAt);

    phaseStartedAt = getSceneOverviewTimingNow();
    const overview = buildSceneOverview({
      repositoryState,
      sceneId,
    });
    const buildOverviewMs = getSceneOverviewDurationMs(phaseStartedAt);

    if (!overview) {
      queueSceneOverviewDelete({ sceneId });
      logSceneOverviewTiming("scene-build.complete", {
        sceneId,
        durationMs: getSceneOverviewDurationMs(startedAt),
        loadSceneStateMs,
        composeRepositoryStateMs,
        buildOverviewMs,
        hasOverview: false,
      });
      return undefined;
    }

    phaseStartedAt = getSceneOverviewTimingNow();
    queueSceneOverviewSave({
      sceneId,
      overview,
      lastCommittedId: Number.isFinite(latestRelevantRevision)
        ? latestRelevantRevision
        : await getLatestOverviewRevisionForScene(sceneId, checkpoint),
    });
    const queueSaveMs = getSceneOverviewDurationMs(phaseStartedAt);

    phaseStartedAt = getSceneOverviewTimingNow();
    const clonedOverview = structuredClone(overview);
    const cloneOverviewMs = getSceneOverviewDurationMs(phaseStartedAt);

    logSceneOverviewTiming("scene-build.complete", {
      sceneId,
      durationMs: getSceneOverviewDurationMs(startedAt),
      loadSceneStateMs,
      composeRepositoryStateMs,
      buildOverviewMs,
      queueSaveMs,
      cloneOverviewMs,
      sectionCount: overview.sections?.length ?? 0,
      outgoingSceneCount: overview.outgoingSceneIds?.length ?? 0,
      hasOverview: true,
    });

    return clonedOverview;
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
      const startedAt = getSceneOverviewTimingNow();
      logSceneOverviewTiming("load.start", {
        sceneCount: sceneIds.length,
      });

      const overviewsBySceneId = {};

      let phaseStartedAt = getSceneOverviewTimingNow();
      const checkpointsBySceneId = await loadSceneOverviewCheckpoints({
        store,
        sceneIds,
      });
      const loadCheckpointsMs = getSceneOverviewDurationMs(phaseStartedAt);

      phaseStartedAt = getSceneOverviewTimingNow();
      const latestRevisionsBySceneId =
        await getLatestOverviewRevisionsForScenes({
          sceneIds,
          checkpointsBySceneId,
        });
      const loadRevisionsMs = getSceneOverviewDurationMs(phaseStartedAt);

      const activeSceneId = getActiveSceneId();
      const sceneDurations = [];
      let freshCheckpointCount = 0;

      for (const sceneId of sceneIds) {
        const sceneStartedAt = getSceneOverviewTimingNow();
        const checkpoint = checkpointsBySceneId.get(sceneId);
        const latestRelevantRevision = latestRevisionsBySceneId.get(sceneId);
        const usedFreshCheckpoint =
          sceneId !== activeSceneId &&
          isCheckpointHistoryCompatible(checkpoint) &&
          isSceneOverviewCheckpointFresh({
            checkpoint,
            latestRelevantRevision,
          });

        const overview = await ensureSceneOverviewWithCheckpoint({
          sceneId,
          checkpoint,
          latestRelevantRevision,
        });
        if (overview) {
          overviewsBySceneId[sceneId] = overview;
        }

        if (usedFreshCheckpoint) {
          freshCheckpointCount += 1;
        }
        sceneDurations.push({
          sceneId,
          durationMs: getSceneOverviewDurationMs(sceneStartedAt),
          usedFreshCheckpoint,
          hasOverview: Boolean(overview),
        });
      }

      const slowestScenes = [...sceneDurations]
        .sort((left, right) => right.durationMs - left.durationMs)
        .slice(0, 10);

      logSceneOverviewTiming("load.complete", {
        durationMs: getSceneOverviewDurationMs(startedAt),
        loadCheckpointsMs,
        loadRevisionsMs,
        sceneCount: sceneIds.length,
        overviewCount: Object.keys(overviewsBySceneId).length,
        freshCheckpointCount,
        rebuiltSceneCount: sceneIds.length - freshCheckpointCount,
        slowestScenes,
      });

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
