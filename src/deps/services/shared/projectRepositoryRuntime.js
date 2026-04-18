import { createMaterializedViewRuntime } from "insieme/client";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "./collab/partitions.js";
import { createMainStateViewDefinition } from "./projectRepositoryViews/mainStateView.js";
import { createSceneBundleRuntime } from "./projectRepositoryViews/sceneBundleRuntime.js";
import {
  applySceneEventsToLoadedProjection,
  composeRepositoryState,
  composeRepositoryStateWithScenes,
  deleteSceneProjectionCheckpoint,
  findLineLocationInState,
  findSectionLocationInState,
  loadSceneProjectionState,
  saveSceneProjectionCheckpoint,
} from "./projectRepositoryViews/sceneStateView.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
  cloneState,
  createMainProjectionState,
  getLatestSceneProjectionRevision,
  iterateCommittedEventBatches,
  isNonEmptyString,
  resolveSceneIdForPartition,
  toCommittedProjectEvent,
} from "./projectRepositoryViews/shared.js";

const summarizeReplayEvent = (event, index) => ({
  arrayIndex: index,
  eventOffset: index + 1,
  id: event?.id,
  type: event?.type,
  partition: event?.partition,
  projectId: event?.projectId,
  clientTs: Number.isFinite(Number(event?.clientTs))
    ? Number(event.clientTs)
    : Number.isFinite(Number(event?.meta?.clientTs))
      ? Number(event.meta.clientTs)
      : undefined,
  payload: structuredClone(event?.payload),
});

const createReplayError = ({
  error,
  events,
  targetEventCount,
  failedEventArrayIndex,
  baseIndex = 0,
  fallbackFailedBatchIndex,
}) => {
  const hasFailedIndex =
    Number.isInteger(failedEventArrayIndex) &&
    failedEventArrayIndex >= 0 &&
    failedEventArrayIndex < targetEventCount;
  const resolvedFailedIndex = hasFailedIndex
    ? failedEventArrayIndex
    : undefined;
  const failedBatchIndex =
    resolvedFailedIndex === undefined
      ? Number.isInteger(fallbackFailedBatchIndex) &&
        fallbackFailedBatchIndex >= 0 &&
        fallbackFailedBatchIndex < events.length
        ? fallbackFailedBatchIndex
        : undefined
      : resolvedFailedIndex - baseIndex;
  const startBatchIndex =
    failedBatchIndex === undefined ? 0 : Math.max(0, failedBatchIndex - 2);
  const endBatchIndex =
    failedBatchIndex === undefined
      ? Math.min(events.length, 3)
      : Math.min(events.length, failedBatchIndex + 3);
  const replayDiagnostics = {
    targetEventCount,
    failedEventArrayIndex: resolvedFailedIndex,
    failedEventOffset:
      resolvedFailedIndex === undefined ? undefined : resolvedFailedIndex + 1,
    failedEvent:
      resolvedFailedIndex === undefined || failedBatchIndex === undefined
        ? undefined
        : summarizeReplayEvent(events[failedBatchIndex], resolvedFailedIndex),
    nearbyEvents: events
      .slice(startBatchIndex, endBatchIndex)
      .map((event, eventIndexOffset) =>
        summarizeReplayEvent(
          event,
          baseIndex + startBatchIndex + eventIndexOffset,
        ),
      ),
  };
  const replayError = new Error(
    error?.message || "Failed to replay repository history",
  );

  replayError.name = "ProjectRepositoryReplayError";
  replayError.code = error?.code || "history_replay_failed";
  replayError.cause = error;
  replayError.details = {
    ...(error?.details && typeof error.details === "object"
      ? structuredClone(error.details)
      : {}),
    replay: replayDiagnostics,
  };
  return replayError;
};

export const replayEventsToRepositoryState = ({
  events,
  untilEventIndex,
  createInitialState,
  reduceEventToState,
  reduceEventsToState,
}) => {
  const parsedIndex = Number(untilEventIndex);
  const targetIndex = Number.isFinite(parsedIndex)
    ? Math.max(0, Math.min(Math.floor(parsedIndex), events.length))
    : events.length;

  if (typeof reduceEventsToState === "function") {
    try {
      return reduceEventsToState({
        repositoryState: createInitialState(),
        events: events.slice(0, targetIndex),
      });
    } catch (error) {
      const failedIndex = Number(error?.details?.commandIndex);
      throw createReplayError({
        error,
        events: events.slice(0, targetIndex),
        targetEventCount: targetIndex,
        failedEventArrayIndex: Number.isInteger(failedIndex)
          ? failedIndex
          : undefined,
        fallbackFailedBatchIndex: Number.isInteger(failedIndex)
          ? failedIndex
          : undefined,
      });
    }
  }

  let state = createInitialState();
  for (let index = 0; index < targetIndex; index += 1) {
    try {
      const nextState = reduceEventToState({
        repositoryState: state,
        event: events[index],
      });
      if (nextState !== undefined) {
        state = nextState;
      }
    } catch (error) {
      throw createReplayError({
        error,
        events: events.slice(0, targetIndex),
        targetEventCount: targetIndex,
        failedEventArrayIndex: index,
        fallbackFailedBatchIndex: index,
      });
    }
  }

  return state;
};

export const projectRepositoryMainPartition = () => MAIN_PARTITION;

export const projectRepositoryScenePartitionFor = (sceneId) =>
  scenePartitionFor(sceneId);

export const projectRepositoryMainScenePartitionFor = (sceneId) =>
  mainScenePartitionFor(sceneId);

export const createProjectRepositoryRuntime = async ({
  projectId,
  store,
  events: sourceEvents,
  historyLoaded = Array.isArray(sourceEvents),
  initialRevision,
  historyStats,
  loadEvents = async () => [],
  createInitialState,
  reduceEventToState,
  reduceEventsToState,
  assertState = () => {},
  onHydrationProgress = () => {},
}) => {
  let events = Array.isArray(sourceEvents)
    ? sourceEvents.map((event) => structuredClone(event))
    : [];
  let hasLoadedEvents = historyLoaded;
  let historyLoadPromise;
  const listeners = new Set();
  let activeSceneId = null;
  let activeSceneState = null;
  let hasExplicitActiveScene = false;
  let currentRevision = Number.isFinite(Number(initialRevision))
    ? Math.max(0, Math.floor(Number(initialRevision)))
    : events.length;
  let activeHydrationProgress;
  const hasDraftHistory = Number(historyStats?.draftCount || 0) > 0;

  const toProgressValue = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.max(0, Math.floor(numericValue));
  };

  const emitHydrationProgress = ({ current, total }) => {
    onHydrationProgress({
      current: toProgressValue(current),
      total: toProgressValue(total),
    });
  };

  const ensureEventHistoryLoaded = async () => {
    if (hasLoadedEvents) {
      return events;
    }

    if (historyLoadPromise) {
      return historyLoadPromise;
    }

    historyLoadPromise = Promise.resolve(loadEvents())
      .then((loadedEvents) => {
        events = Array.isArray(loadedEvents)
          ? loadedEvents.map((event) => structuredClone(event))
          : [];
        hasLoadedEvents = true;
        currentRevision = Math.max(currentRevision, events.length);
        return events;
      })
      .catch((error) => {
        historyLoadPromise = undefined;
        throw error;
      });

    return historyLoadPromise;
  };

  const beginInitialMainHydrationProgress = async () => {
    const total = toProgressValue(events.length);
    const resolvedTotal = Math.max(total, toProgressValue(currentRevision));
    if (resolvedTotal <= 0) {
      return undefined;
    }

    const checkpoint = await store.loadMaterializedViewCheckpoint({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });
    const current =
      checkpoint?.viewVersion === MAIN_VIEW_VERSION
        ? Math.min(resolvedTotal, toProgressValue(checkpoint?.lastCommittedId))
        : 0;

    if (current >= resolvedTotal) {
      return undefined;
    }

    const progress = {
      total: resolvedTotal,
      current,
    };

    activeHydrationProgress = progress;
    emitHydrationProgress(progress);
    return progress;
  };

  const reportHydrationProgressFromBatch = (batch = []) => {
    if (!activeHydrationProgress) {
      return;
    }

    const latestCommittedId = Array.isArray(batch)
      ? batch.at(-1)?.committedId
      : 0;
    const nextCurrent = Math.min(
      activeHydrationProgress.total,
      Math.max(
        activeHydrationProgress.current,
        toProgressValue(latestCommittedId),
      ),
    );

    if (nextCurrent === activeHydrationProgress.current) {
      return;
    }

    activeHydrationProgress.current = nextCurrent;
    emitHydrationProgress(activeHydrationProgress);
  };

  const saveCurrentMainCheckpoint = async () => {
    const value = structuredClone(getCurrentComposedState());
    await store.saveMaterializedViewCheckpoint({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
      viewVersion: MAIN_VIEW_VERSION,
      lastCommittedId: currentRevision,
      value,
      updatedAt: Date.now(),
    });
  };

  const endInitialMainHydrationProgress = ({
    progress,
    completed = false,
  } = {}) => {
    if (!progress || activeHydrationProgress !== progress) {
      return;
    }

    if (completed && progress.current < progress.total) {
      progress.current = progress.total;
      emitHydrationProgress(progress);
    }

    activeHydrationProgress = undefined;
  };

  const materializedViewRuntime = createMaterializedViewRuntime({
    materializedViews: [
      createMainStateViewDefinition({
        createInitialState,
        reduceEventToState,
      }),
    ],
    getLatestCommittedId: async () =>
      hasLoadedEvents ? events.length : currentRevision,
    listCommittedAfter: async ({ sinceCommittedId, limit }) => {
      if (!hasLoadedEvents && !hasDraftHistory) {
        const committedBatch = await store.listCommittedAfter({
          sinceCommittedId,
          limit,
        });
        const normalizedCommittedBatch = Array.isArray(committedBatch)
          ? committedBatch.map((event) => structuredClone(event))
          : [];

        reportHydrationProgressFromBatch(normalizedCommittedBatch);
        return normalizedCommittedBatch;
      }

      await ensureEventHistoryLoaded();
      const startIndex = Math.max(
        0,
        Number.isFinite(Number(sinceCommittedId))
          ? Math.floor(Number(sinceCommittedId))
          : 0,
      );
      const safeLimit =
        Number.isInteger(limit) && limit > 0 ? limit : events.length;
      const batch = events
        .slice(startIndex, startIndex + safeLimit)
        .map((event, index) =>
          toCommittedProjectEvent({
            event,
            committedId: startIndex + index + 1,
            projectId,
          }),
        );

      reportHydrationProgressFromBatch(batch);
      return batch;
    },
    loadCheckpoint: async ({ viewName, partition }) =>
      store.loadMaterializedViewCheckpoint({
        viewName,
        partition,
      }),
    saveCheckpoint: async (checkpoint) =>
      store.saveMaterializedViewCheckpoint(checkpoint),
    deleteCheckpoint: async ({ viewName, partition }) =>
      store.deleteMaterializedViewCheckpoint({
        viewName,
        partition,
      }),
  });

  const initialMainHydrationProgress =
    await beginInitialMainHydrationProgress();
  let currentMainState;

  try {
    currentMainState = cloneState(
      await materializedViewRuntime.loadMaterializedView({
        viewName: MAIN_VIEW_NAME,
        partition: MAIN_PARTITION,
      }),
      createMainProjectionState(createInitialState()),
    );
  } finally {
    endInitialMainHydrationProgress({
      progress: initialMainHydrationProgress,
      completed: currentMainState !== undefined,
    });
  }

  assertState(currentMainState);

  const refreshMainState = async () => {
    currentMainState = cloneState(
      await materializedViewRuntime.loadMaterializedView({
        viewName: MAIN_VIEW_NAME,
        partition: MAIN_PARTITION,
      }),
      createMainProjectionState(createInitialState()),
    );
    assertState(currentMainState);
  };

  const listCommittedAfterFromStore = async ({ sinceCommittedId, limit }) => {
    const committedBatch = await store.listCommittedAfter({
      sinceCommittedId,
      limit,
    });

    return Array.isArray(committedBatch)
      ? committedBatch.map((event) => structuredClone(event))
      : [];
  };

  const listCommittedAfterFromRepository = async ({
    sinceCommittedId,
    limit,
  } = {}) => {
    if (!hasLoadedEvents && !hasDraftHistory) {
      return listCommittedAfterFromStore({
        sinceCommittedId,
        limit,
      });
    }

    await ensureEventHistoryLoaded();
    const startIndex = Math.max(
      0,
      Number.isFinite(Number(sinceCommittedId))
        ? Math.floor(Number(sinceCommittedId))
        : 0,
    );
    const safeLimit =
      Number.isInteger(limit) && limit > 0 ? limit : events.length;
    return events
      .slice(startIndex, startIndex + safeLimit)
      .map((event, index) =>
        toCommittedProjectEvent({
          event,
          committedId: startIndex + index + 1,
          projectId,
        }),
      );
  };

  const loadState = async (untilEventIndex) => {
    if (hasLoadedEvents || hasDraftHistory) {
      const replayEvents = hasLoadedEvents
        ? events
        : await ensureEventHistoryLoaded();
      return replayEventsToRepositoryState({
        events: replayEvents,
        untilEventIndex,
        createInitialState,
        reduceEventToState,
        reduceEventsToState,
      });
    }

    const parsedIndex = Number(untilEventIndex);
    const targetIndex = Number.isFinite(parsedIndex)
      ? Math.max(0, Math.min(Math.floor(parsedIndex), currentRevision))
      : currentRevision;

    let replayedEventCount = 0;
    let state = createInitialState();

    for await (const committedBatch of iterateCommittedEventBatches({
      listCommittedAfter: listCommittedAfterFromStore,
    })) {
      const remainingEventCount = targetIndex - replayedEventCount;
      if (remainingEventCount <= 0) {
        break;
      }

      const replayBatch =
        committedBatch.length > remainingEventCount
          ? committedBatch.slice(0, remainingEventCount)
          : committedBatch;
      const batchStartIndex = replayedEventCount;

      try {
        const nextState = reduceEventsToState({
          repositoryState: state,
          events: replayBatch,
        });
        if (nextState !== undefined) {
          state = nextState;
        }
      } catch (error) {
        const failedBatchIndex = Number(error?.details?.commandIndex);
        throw createReplayError({
          error,
          events: replayBatch,
          targetEventCount: targetIndex,
          failedEventArrayIndex: Number.isInteger(failedBatchIndex)
            ? batchStartIndex + failedBatchIndex
            : undefined,
          baseIndex: batchStartIndex,
          fallbackFailedBatchIndex: Number.isInteger(failedBatchIndex)
            ? failedBatchIndex
            : undefined,
        });
      }

      replayedEventCount += replayBatch.length;
    }

    return state;
  };

  const loadSceneProjection = async (sceneId) => {
    if (!hasLoadedEvents && !hasDraftHistory) {
      return loadSceneProjectionState({
        store,
        mainState: currentMainState,
        listCommittedAfter: listCommittedAfterFromRepository,
        createInitialState,
        reduceEventToState,
        reduceEventsToState,
        sceneId,
      });
    }

    const eventsForProjection = await ensureEventHistoryLoaded();
    return loadSceneProjectionState({
      store,
      mainState: currentMainState,
      events: eventsForProjection,
      listCommittedAfter: listCommittedAfterFromRepository,
      createInitialState,
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });
  };

  const sceneBundleRuntime = createSceneBundleRuntime({
    store,
    listCommittedAfter: listCommittedAfterFromRepository,
    getCurrentMainState: () => currentMainState,
    getActiveSceneId: () => activeSceneId,
    getActiveSceneState: () => activeSceneState,
    loadSceneProjection,
  });

  const getCurrentComposedState = () =>
    composeRepositoryState({
      mainState: currentMainState,
      activeSceneId,
      activeSceneState,
    });

  const notifyStateListeners = () => {
    const repositoryState = structuredClone(getCurrentComposedState());
    const revision = currentRevision;
    listeners.forEach((listener) => {
      listener({
        repositoryState,
        revision,
      });
    });
  };

  const setActiveSceneProjection = ({
    sceneId,
    sceneState,
    explicit = false,
  }) => {
    activeSceneId = isNonEmptyString(sceneId) ? sceneId : null;
    activeSceneState = activeSceneId ? sceneState || null : null;
    if (explicit) {
      hasExplicitActiveScene = activeSceneId !== null;
    }
  };

  const clearActiveSceneProjection = ({ explicit = false } = {}) => {
    activeSceneId = null;
    activeSceneState = null;
    if (explicit) {
      hasExplicitActiveScene = false;
    }
  };

  const ensureActiveSceneProjectionLoaded = async (
    sceneId,
    { explicit = false } = {},
  ) => {
    if (!isNonEmptyString(sceneId)) {
      clearActiveSceneProjection({ explicit });
      return;
    }

    setActiveSceneProjection({
      sceneId,
      sceneState: await loadSceneProjection(sceneId),
      explicit,
    });
  };

  const pruneRemovedActiveScene = async () => {
    if (!activeSceneId) {
      return;
    }

    const sceneExists = Boolean(
      currentMainState?.scenes?.items?.[activeSceneId],
    );
    if (sceneExists) {
      return;
    }

    const removedSceneId = activeSceneId;
    clearActiveSceneProjection();
    await deleteSceneProjectionCheckpoint({ store, sceneId: removedSceneId });
    await sceneBundleRuntime.clearSceneOverview(removedSceneId);
  };

  const updateActiveSceneProjection = async (committedEvents = []) => {
    if (!activeSceneId || !activeSceneState) {
      return;
    }

    const scopedEvents = [];
    for (const committedEvent of committedEvents) {
      const partition = committedEvent?.partition;
      if (!isNonEmptyString(partition) || !partition.startsWith("s:")) {
        continue;
      }

      const sceneId = resolveSceneIdForPartition(currentMainState, partition);
      if (sceneId !== activeSceneId) {
        continue;
      }

      scopedEvents.push(committedEvent);
    }

    if (scopedEvents.length === 0) {
      return;
    }

    activeSceneState = applySceneEventsToLoadedProjection({
      mainState: currentMainState,
      sceneState: activeSceneState,
      sceneId: activeSceneId,
      sourceEvents: scopedEvents,
      reduceEventsToState,
    });

    await saveSceneProjectionCheckpoint({
      store,
      sceneId: activeSceneId,
      value: activeSceneState,
      lastCommittedId: getLatestSceneProjectionRevision({
        events,
        sceneId: activeSceneId,
      }),
      updatedAt: Date.now(),
    });
  };

  const autoAdoptSceneProjection = async (committedEvents = []) => {
    if (hasExplicitActiveScene || activeSceneId) {
      return false;
    }

    for (const committedEvent of committedEvents) {
      const partition = committedEvent?.partition;
      if (!isNonEmptyString(partition) || !partition.startsWith("s:")) {
        continue;
      }

      const sceneId = resolveSceneIdForPartition(currentMainState, partition);
      if (!sceneId) {
        continue;
      }

      await ensureActiveSceneProjectionLoaded(sceneId);
      return true;
    }

    return false;
  };

  const getContextState = async ({
    sceneIds = [],
    sectionIds = [],
    lineIds = [],
  } = {}) => {
    const nextSceneIds = new Set();

    for (const sceneId of sceneIds || []) {
      if (isNonEmptyString(sceneId)) {
        nextSceneIds.add(sceneId);
      }
    }

    const sceneStatesBySceneId = new Map();
    if (activeSceneId && activeSceneState) {
      sceneStatesBySceneId.set(activeSceneId, activeSceneState);
    }

    for (const sectionId of sectionIds || []) {
      const location = findSectionLocationInState(
        getCurrentComposedState(),
        sectionId,
      );
      if (location?.sceneId) {
        nextSceneIds.add(location.sceneId);
      }
    }

    for (const lineId of lineIds || []) {
      const loadedLocation = findLineLocationInState(
        composeRepositoryStateWithScenes({
          mainState: currentMainState,
          sceneStatesBySceneId,
        }),
        lineId,
      );
      if (loadedLocation?.sceneId) {
        nextSceneIds.add(loadedLocation.sceneId);
        continue;
      }

      const knownSceneIds = Object.keys(currentMainState?.scenes?.items || {});
      for (const sceneId of knownSceneIds) {
        const sceneProjection =
          sceneStatesBySceneId.get(sceneId) ||
          (await loadSceneProjection(sceneId));
        sceneStatesBySceneId.set(sceneId, sceneProjection);
        const sceneLocation = findLineLocationInState(sceneProjection, lineId);
        if (sceneLocation?.sceneId) {
          nextSceneIds.add(sceneId);
          break;
        }
      }
    }

    for (const sceneId of nextSceneIds) {
      if (sceneStatesBySceneId.has(sceneId)) {
        continue;
      }

      if (sceneId === activeSceneId && activeSceneState) {
        sceneStatesBySceneId.set(sceneId, activeSceneState);
        continue;
      }

      sceneStatesBySceneId.set(sceneId, await loadSceneProjection(sceneId));
    }

    return composeRepositoryStateWithScenes({
      mainState: currentMainState,
      sceneStatesBySceneId,
    });
  };

  return {
    getState(untilEventIndex) {
      if (untilEventIndex === undefined || untilEventIndex === null) {
        return structuredClone(getCurrentComposedState());
      }

      if (!hasLoadedEvents) {
        throw new Error(
          "Historical repository snapshots require loaded event history",
        );
      }

      // Historical snapshots are replayed into a fresh state tree, so returning
      // that replay result directly avoids one more full clone during export.
      return replayEventsToRepositoryState({
        events,
        untilEventIndex,
        createInitialState,
        reduceEventToState,
        reduceEventsToState,
      });
    },

    getRevision(untilEventIndex) {
      if (untilEventIndex === undefined || untilEventIndex === null) {
        return currentRevision;
      }

      const parsedIndex = Number(untilEventIndex);
      if (!Number.isFinite(parsedIndex)) {
        return currentRevision;
      }

      return Math.max(0, Math.min(Math.floor(parsedIndex), events.length));
    },

    async loadEvents() {
      return (await ensureEventHistoryLoaded()).map((event) =>
        structuredClone(event),
      );
    },

    async loadState(untilEventIndex) {
      return structuredClone(await loadState(untilEventIndex));
    },

    subscribe(listener, { emitCurrent = true } = {}) {
      if (typeof listener !== "function") {
        throw new Error("listener must be a function");
      }

      listeners.add(listener);
      if (emitCurrent) {
        listener({
          repositoryState: structuredClone(getCurrentComposedState()),
          revision: currentRevision,
        });
      }

      return () => {
        listeners.delete(listener);
      };
    },

    async setActiveSceneId(sceneId) {
      const nextSceneId = isNonEmptyString(sceneId) ? sceneId : null;
      if (activeSceneId === nextSceneId && (!nextSceneId || activeSceneState)) {
        hasExplicitActiveScene = nextSceneId !== null;
        return;
      }

      if (nextSceneId) {
        await ensureActiveSceneProjectionLoaded(nextSceneId, {
          explicit: true,
        });
        await sceneBundleRuntime.ensureSceneBundle(nextSceneId);
      } else {
        clearActiveSceneProjection({ explicit: true });
      }

      notifyStateListeners();
    },

    async clearActiveSceneId() {
      clearActiveSceneProjection({ explicit: true });
      notifyStateListeners();
    },

    async getContextState(payload = {}) {
      return structuredClone(await getContextState(payload));
    },

    async getSceneOverview(sceneId) {
      return sceneBundleRuntime.ensureSceneBundle(sceneId);
    },

    async loadSceneOverviews({ sceneIds = [] } = {}) {
      return sceneBundleRuntime.loadSceneOverviews({ sceneIds });
    },

    async addEvent(event) {
      if (!hasLoadedEvents) {
        await ensureEventHistoryLoaded();
      }

      events.push(structuredClone(event));
      currentRevision = events.length;

      const committedEvent = toCommittedProjectEvent({
        event,
        committedId: currentRevision,
        projectId,
      });

      await materializedViewRuntime.onCommittedEvent(committedEvent);
      await refreshMainState();
      const adoptedActiveScene = await autoAdoptSceneProjection([
        committedEvent,
      ]);
      if (!adoptedActiveScene) {
        await updateActiveSceneProjection([committedEvent]);
      }
      await pruneRemovedActiveScene();
      await sceneBundleRuntime.handleCommittedEvents([committedEvent]);
      notifyStateListeners();
    },

    async addEvents(sourceEvents = []) {
      const nextEvents = Array.isArray(sourceEvents)
        ? sourceEvents.filter(Boolean)
        : [];
      if (nextEvents.length === 0) {
        return;
      }

      if (!hasLoadedEvents) {
        await ensureEventHistoryLoaded();
      }

      const committedEvents = [];
      for (const event of nextEvents) {
        events.push(structuredClone(event));
        currentRevision = events.length;
        const committedEvent = toCommittedProjectEvent({
          event,
          committedId: currentRevision,
          projectId,
        });
        committedEvents.push(committedEvent);
        await materializedViewRuntime.onCommittedEvent(committedEvent);
      }

      await refreshMainState();
      const adoptedActiveScene =
        await autoAdoptSceneProjection(committedEvents);
      if (!adoptedActiveScene) {
        await updateActiveSceneProjection(committedEvents);
      }
      await pruneRemovedActiveScene();
      await sceneBundleRuntime.handleCommittedEvents(committedEvents);
      notifyStateListeners();
    },

    async flushMainCheckpoint() {
      await materializedViewRuntime.flushMaterializedView({
        viewName: MAIN_VIEW_NAME,
        partition: MAIN_PARTITION,
      });
      await saveCurrentMainCheckpoint();
    },

    async flushMaterializedViews() {
      await materializedViewRuntime.flushMaterializedViews();
      await saveCurrentMainCheckpoint();
      await sceneBundleRuntime.flushSceneOverviews();
    },
  };
};
