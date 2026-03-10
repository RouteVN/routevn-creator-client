import { createMaterializedViewRuntime } from "insieme/client";

const PROJECT_STATE_VIEW_NAME = "project_repository_state";
const PROJECT_STATE_VIEW_VERSION = "1";
const PROJECT_STATE_CHECKPOINT = {
  mode: "debounce",
  debounceMs: 1000,
  maxDirtyEvents: 100,
};

export const projectRepositoryStatePartitionFor = (projectId) =>
  `project:${projectId}:repository_state`;

const toCommittedProjectStateEvent = ({ event, committedId, projectId }) => ({
  ...structuredClone(event),
  committedId,
  id:
    typeof event?.id === "string" && event.id.length > 0
      ? event.id
      : `repository-${projectId}-${committedId}`,
  partitions: [projectRepositoryStatePartitionFor(projectId)],
  projectId: event?.projectId || projectId,
  meta: {
    ...(event?.meta ? structuredClone(event.meta) : {}),
    clientId: event?.meta?.clientId || "repository",
    clientTs: Number.isFinite(Number(event?.meta?.clientTs))
      ? Number(event.meta.clientTs)
      : committedId,
  },
  created: committedId,
});

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

  const projectPartition = projectRepositoryStatePartitionFor(projectId);

  const projectStateRuntime = createMaterializedViewRuntime({
    materializedViews: [
      {
        name: PROJECT_STATE_VIEW_NAME,
        version: PROJECT_STATE_VIEW_VERSION,
        checkpoint: PROJECT_STATE_CHECKPOINT,
        initialState: () => createInitialState(),
        reduce: ({ state, event, partition }) => {
          if (partition !== projectPartition) return state;
          if (!event || typeof event !== "object" || Array.isArray(event)) {
            return state;
          }

          const nextState = reduceEventToState({
            repositoryState: state,
            event,
          });
          return nextState === undefined ? state : nextState;
        },
      },
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
          toCommittedProjectStateEvent({
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

  let currentState = await projectStateRuntime.loadMaterializedView({
    viewName: PROJECT_STATE_VIEW_NAME,
    partition: projectPartition,
  });
  if (!currentState || typeof currentState !== "object") {
    currentState = createInitialState();
  }
  assertState(currentState);

  const notifyStateListeners = () => {
    const snapshot = structuredClone(currentState);
    listeners.forEach((listener) => {
      listener(snapshot);
    });
  };

  return {
    getState(untilEventIndex) {
      if (untilEventIndex === undefined || untilEventIndex === null) {
        return structuredClone(currentState);
      }

      const replayedState = replayEventsToRepositoryState({
        events,
        untilEventIndex,
        createInitialState,
        reduceEventToState,
      });
      return structuredClone(replayedState);
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
        listener(structuredClone(currentState));
      }

      return () => {
        listeners.delete(listener);
      };
    },

    async addEvent(event) {
      await store.appendEvent(event);
      events.push(structuredClone(event));
      const committedId = events.length;

      await projectStateRuntime.onCommittedEvent(
        toCommittedProjectStateEvent({
          event,
          committedId,
          projectId,
        }),
      );

      currentState = await projectStateRuntime.loadMaterializedView({
        viewName: PROJECT_STATE_VIEW_NAME,
        partition: projectPartition,
      });
      assertState(currentState);
      notifyStateListeners();
    },
  };
};
