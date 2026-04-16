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
  cloneState,
  createMainProjectionState,
  getLatestSceneProjectionRevision,
  isNonEmptyString,
  resolveSceneIdForPartition,
  toCommittedProjectEvent,
} from "./projectRepositoryViews/shared.js";

export const replayEventsToRepositoryState = ({
  events,
  untilEventIndex,
  createInitialState,
  reduceEventToState,
}) => {
  const parsedIndex = Number(untilEventIndex);
  const targetIndex = Number.isFinite(parsedIndex)
    ? Math.max(0, Math.min(Math.floor(parsedIndex), events.length))
    : events.length;

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
      const startIndex = Math.max(0, index - 2);
      const endIndex = Math.min(targetIndex, index + 3);
      const replayDiagnostics = {
        targetEventCount: targetIndex,
        failedEventArrayIndex: index,
        failedEventOffset: index + 1,
        failedEvent: summarizeReplayEvent(events[index], index),
        nearbyEvents: events
          .slice(startIndex, endIndex)
          .map((event, eventIndexOffset) =>
            summarizeReplayEvent(event, startIndex + eventIndexOffset),
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
      throw replayError;
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
  events: sourceEvents = [],
  createInitialState,
  reduceEventToState,
  assertState = () => {},
}) => {
  const events = Array.isArray(sourceEvents)
    ? sourceEvents.map((event) => structuredClone(event))
    : [];
  const listeners = new Set();
  let activeSceneId = null;
  let activeSceneState = null;
  let hasExplicitActiveScene = false;
  let currentRevision = events.length;

  const materializedViewRuntime = createMaterializedViewRuntime({
    materializedViews: [
      createMainStateViewDefinition({
        createInitialState,
        reduceEventToState,
      }),
    ],
    getLatestCommittedId: async () => events.length,
    listCommittedAfter: async ({ sinceCommittedId, limit }) => {
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
    },
    loadCheckpoint: async ({ viewName, partition }) =>
      store.loadMaterializedViewCheckpoint?.({
        viewName,
        partition,
      }),
    saveCheckpoint: async (checkpoint) =>
      store.saveMaterializedViewCheckpoint?.(checkpoint),
    deleteCheckpoint: async ({ viewName, partition }) =>
      store.deleteMaterializedViewCheckpoint?.({
        viewName,
        partition,
      }),
  });

  let currentMainState = cloneState(
    await materializedViewRuntime.loadMaterializedView({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    }),
    createMainProjectionState(createInitialState()),
  );
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

  const loadSceneProjection = async (sceneId) =>
    loadSceneProjectionState({
      store,
      mainState: currentMainState,
      events,
      createInitialState,
      reduceEventToState,
      sceneId,
    });

  const sceneBundleRuntime = createSceneBundleRuntime({
    store,
    events,
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
      reduceEventToState,
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

      // Historical snapshots are replayed into a fresh state tree, so returning
      // that replay result directly avoids one more full clone during export.
      return replayEventsToRepositoryState({
        events,
        untilEventIndex,
        createInitialState,
        reduceEventToState,
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

    getEvents() {
      return events.map((event) => structuredClone(event));
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
      if (typeof store.appendEvent === "function") {
        await store.appendEvent(event);
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

      if (typeof store.appendEvents === "function") {
        await store.appendEvents(nextEvents);
      } else if (typeof store.appendEvent === "function") {
        for (const event of nextEvents) {
          await store.appendEvent(event);
        }
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

    async flushMaterializedViews() {
      await materializedViewRuntime.flushMaterializedViews();
      await sceneBundleRuntime.flushSceneOverviews();
    },
  };
};
