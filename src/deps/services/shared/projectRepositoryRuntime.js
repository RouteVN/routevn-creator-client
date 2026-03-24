import { createMaterializedViewRuntime } from "insieme/client";
import {
  mainScenePartitionFor,
  scenePartitionFor,
  scenePartitionTokenFor,
} from "./collab/partitions.js";
import { createMainStateViewDefinition } from "./projectRepositoryViews/mainStateView.js";
import { createSceneBundleRuntime } from "./projectRepositoryViews/sceneBundleRuntime.js";
import {
  composeRepositoryState,
  findLineLocationInState,
  findSectionLocationInState,
  loadSceneProjectionState,
} from "./projectRepositoryViews/sceneStateView.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  cloneState,
  createMainProjectionState,
  isNonEmptyString,
  resolveSceneIdForPartition,
  toCommittedProjectEvent,
} from "./projectRepositoryViews/shared.js";

const replayEventsToRepositoryState = ({
  events,
  untilEventIndex,
  createInitialState,
  reduceEventToState,
}) => {
  const parsedIndex = Number(untilEventIndex);
  const targetIndex = Number.isFinite(parsedIndex)
    ? Math.max(0, Math.min(Math.floor(parsedIndex), events.length))
    : events.length;

  let state = createInitialState();
  for (let index = 0; index < targetIndex; index += 1) {
    const nextState = reduceEventToState({
      repositoryState: state,
      event: events[index],
    });
    if (nextState !== undefined) {
      state = nextState;
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
  const loadedSceneStates = new Map();
  const latestSceneProjectionRevisionByToken = new Map();
  let activeSceneId = null;
  let currentRevision = events.length;

  const recordSceneProjectionRevision = ({ partition, revision }) => {
    if (
      !isNonEmptyString(partition) ||
      !Number.isInteger(revision) ||
      revision <= 0 ||
      !partition.startsWith("s:")
    ) {
      return;
    }

    const token = partition.slice(2);
    if (!token) {
      return;
    }

    latestSceneProjectionRevisionByToken.set(
      token,
      Math.max(latestSceneProjectionRevisionByToken.get(token) || 0, revision),
    );
  };

  for (let index = 0; index < events.length; index += 1) {
    recordSceneProjectionRevision({
      partition: events[index]?.partition,
      revision: index + 1,
    });
  }

  const getLatestRelevantSceneProjectionRevision = (sceneId) =>
    latestSceneProjectionRevisionByToken.get(scenePartitionTokenFor(sceneId)) ||
    0;

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

  const loadSceneProjection = async (sceneId) =>
    loadSceneProjectionState({
      store,
      mainState: currentMainState,
      events,
      createInitialState,
      reduceEventToState,
      sceneId,
      latestRelevantRevision: getLatestRelevantSceneProjectionRevision(sceneId),
    });

  let currentMainState = cloneState(
    await materializedViewRuntime.loadMaterializedView({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    }),
    createMainProjectionState(createInitialState()),
  );
  assertState(currentMainState);

  const sceneBundleRuntime = createSceneBundleRuntime({
    store,
    events,
    getCurrentRevision: () => currentRevision,
    getCurrentMainState: () => currentMainState,
    getLoadedSceneStates: () => loadedSceneStates,
    loadSceneProjection,
    evictSceneProjection: async (sceneId) => {
      loadedSceneStates.delete(sceneId);
    },
  });

  const getCurrentComposedState = () =>
    composeRepositoryState({
      mainState: currentMainState,
      sceneStatesBySceneId: loadedSceneStates,
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

  const loadMainProjection = async () => {
    currentMainState = cloneState(
      await materializedViewRuntime.loadMaterializedView({
        viewName: MAIN_VIEW_NAME,
        partition: MAIN_PARTITION,
      }),
      createMainProjectionState(createInitialState()),
    );
    assertState(currentMainState);
  };

  const ensureSceneProjectionLoaded = async (sceneId) => {
    if (!isNonEmptyString(sceneId)) {
      return;
    }

    loadedSceneStates.set(sceneId, await loadSceneProjection(sceneId));
    await sceneBundleRuntime.ensureSceneBundle(sceneId, {
      keepSceneLoaded: true,
    });
  };

  const refreshLoadedSceneProjections = async () => {
    const sceneIds = [...loadedSceneStates.keys()];
    for (const sceneId of sceneIds) {
      loadedSceneStates.set(sceneId, await loadSceneProjection(sceneId));
    }
  };

  const evictSceneProjection = async (sceneId) => {
    if (!loadedSceneStates.has(sceneId)) {
      return;
    }

    loadedSceneStates.delete(sceneId);
  };

  const syncCurrentState = async ({ autoLoadPartitions = [] } = {}) => {
    await loadMainProjection();

    const autoLoadSceneIds = new Set();
    if (isNonEmptyString(activeSceneId)) {
      autoLoadSceneIds.add(activeSceneId);
    }

    for (const partition of autoLoadPartitions) {
      const sceneId = resolveSceneIdForPartition(currentMainState, partition);
      if (sceneId) {
        autoLoadSceneIds.add(sceneId);
      }
    }

    for (const sceneId of autoLoadSceneIds) {
      if (!loadedSceneStates.has(sceneId)) {
        await ensureSceneProjectionLoaded(sceneId);
      }
    }

    await refreshLoadedSceneProjections();
  };

  const ensureScenesLoaded = async ({
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

    for (const sectionId of sectionIds || []) {
      const location = findSectionLocationInState(currentMainState, sectionId);
      if (location?.sceneId) {
        nextSceneIds.add(location.sceneId);
      }
    }

    const composedState = getCurrentComposedState();
    for (const lineId of lineIds || []) {
      const loadedLocation = findLineLocationInState(composedState, lineId);
      if (loadedLocation?.sceneId) {
        nextSceneIds.add(loadedLocation.sceneId);
        continue;
      }

      const knownSceneIds = Object.keys(currentMainState?.scenes?.items || {});
      for (const sceneId of knownSceneIds) {
        if (loadedSceneStates.has(sceneId)) {
          continue;
        }

        const sceneProjection = await loadSceneProjection(sceneId);
        const sceneLocation = findLineLocationInState(sceneProjection, lineId);
        if (sceneLocation?.sceneId) {
          loadedSceneStates.set(sceneId, sceneProjection);
          nextSceneIds.add(sceneId);
          await sceneBundleRuntime.ensureSceneBundle(sceneId, {
            keepSceneLoaded: true,
          });
          break;
        }
      }
    }

    for (const sceneId of nextSceneIds) {
      await ensureSceneProjectionLoaded(sceneId);
    }
  };

  return {
    getState(untilEventIndex) {
      if (untilEventIndex === undefined || untilEventIndex === null) {
        return structuredClone(getCurrentComposedState());
      }

      return structuredClone(
        replayEventsToRepositoryState({
          events,
          untilEventIndex,
          createInitialState,
          reduceEventToState,
        }),
      );
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
      if (
        activeSceneId === nextSceneId &&
        (!nextSceneId || loadedSceneStates.has(nextSceneId))
      ) {
        return;
      }

      activeSceneId = nextSceneId;
      const retainedSceneIds = new Set(nextSceneId ? [nextSceneId] : []);
      const loadedSceneIds = Array.from(loadedSceneStates.keys());
      for (const loadedSceneId of loadedSceneIds) {
        if (!retainedSceneIds.has(loadedSceneId)) {
          await evictSceneProjection(loadedSceneId);
        }
      }

      if (nextSceneId) {
        await ensureSceneProjectionLoaded(nextSceneId);
      }

      await syncCurrentState();
      notifyStateListeners();
    },

    async clearActiveSceneId() {
      activeSceneId = null;
      const loadedSceneIds = Array.from(loadedSceneStates.keys());
      for (const sceneId of loadedSceneIds) {
        await evictSceneProjection(sceneId);
      }
      notifyStateListeners();
    },

    async ensureScenesLoaded(payload = {}) {
      await ensureScenesLoaded(payload);
    },

    async getSceneOverview(sceneId) {
      return sceneBundleRuntime.ensureSceneBundle(sceneId, {
        keepSceneLoaded: loadedSceneStates.has(sceneId),
      });
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
      recordSceneProjectionRevision({
        partition: committedEvent.partition,
        revision: committedEvent.committedId,
      });

      await materializedViewRuntime.onCommittedEvent(committedEvent);
      await syncCurrentState({
        autoLoadPartitions: [event?.partition],
      });
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
        recordSceneProjectionRevision({
          partition: committedEvent.partition,
          revision: committedEvent.committedId,
        });
        committedEvents.push(committedEvent);
        await materializedViewRuntime.onCommittedEvent(committedEvent);
      }

      await syncCurrentState({
        autoLoadPartitions: nextEvents.map((event) => event?.partition),
      });
      await sceneBundleRuntime.handleCommittedEvents(committedEvents);
      notifyStateListeners();
    },

    async flushMaterializedViews() {
      await materializedViewRuntime.flushMaterializedViews();
      await sceneBundleRuntime.flushSceneOverviews();
    },
  };
};
