import { createInMemoryClientStore } from "insieme";

const PROJECT_STATE_VIEW_NAME = "project_repository_state";
const PROJECT_STATE_VIEW_VERSION = "1";

export const projectRepositoryStatePartitionFor = (projectId) =>
  `project:${projectId}:repository_state`;

const toCommittedProjectStateEvent = ({ event, committedId, projectId }) => ({
  committed_id: committedId,
  id: `repository-${projectId}-${committedId}`,
  client_id: "repository",
  partitions: [projectRepositoryStatePartitionFor(projectId)],
  event: structuredClone(event),
  status_updated_at: committedId,
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

  const projectPartition = projectRepositoryStatePartitionFor(projectId);

  const projectStateStore = createInMemoryClientStore({
    materializedViews: [
      {
        name: PROJECT_STATE_VIEW_NAME,
        version: PROJECT_STATE_VIEW_VERSION,
        initialState: () => createInitialState(),
        reduce: ({ state, event, partition }) => {
          if (partition !== projectPartition) return state;
          const repositoryEvent = event?.event;
          if (!repositoryEvent || typeof repositoryEvent.type !== "string") {
            return state;
          }

          const nextState = reduceEventToState({
            repositoryState: state,
            event: repositoryEvent,
          });
          return nextState === undefined ? state : nextState;
        },
      },
    ],
  });

  await projectStateStore.init();

  if (events.length > 0) {
    await projectStateStore.applyCommittedBatch({
      events: events.map((event, index) =>
        toCommittedProjectStateEvent({
          event,
          committedId: index + 1,
          projectId,
        }),
      ),
      nextCursor: events.length,
    });
  }

  let currentState = await projectStateStore.loadMaterializedView({
    viewName: PROJECT_STATE_VIEW_NAME,
    partition: projectPartition,
  });
  if (!currentState || typeof currentState !== "object") {
    currentState = createInitialState();
  }

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

    async addEvent(event) {
      await store.appendTypedEvent(event);
      events.push(structuredClone(event));
      const committedId = events.length;

      await projectStateStore.applyCommittedBatch({
        events: [
          toCommittedProjectStateEvent({
            event,
            committedId,
            projectId,
          }),
        ],
        nextCursor: committedId,
      });

      currentState = await projectStateStore.loadMaterializedView({
        viewName: PROJECT_STATE_VIEW_NAME,
        partition: projectPartition,
      });
      assertState(currentState);
    },
  };
};
