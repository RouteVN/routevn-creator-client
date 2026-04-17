import { describe, expect, it, vi } from "vitest";
import {
  createProjectCreateRepositoryEvent,
  applyCommandToRepositoryState,
  applyRepositoryEventsToRepositoryState,
  initialProjectData,
  repositoryEventToCommand,
  createRepositoryCommandEvent,
} from "../../src/deps/services/shared/projectRepository.js";
import { loadSceneProjectionState } from "../../src/deps/services/shared/projectRepositoryViews/sceneStateView.js";
import {
  SCENE_VIEW_VERSION,
  createMainProjectionState,
  createSceneProjectionState,
} from "../../src/deps/services/shared/projectRepositoryViews/shared.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../../src/deps/services/shared/collab/partitions.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const projectId = "project-1";
const sceneId = "scene-1";
const sectionId = "section-1";
const targetSectionId = "section-2";
const lineId = "line-1";

const createCommandEvent = ({ id, partition, type, payload, clientTs }) =>
  createRepositoryCommandEvent({
    command: {
      id,
      projectId,
      partition,
      type,
      payload,
      actor: {
        userId: "user-1",
        clientId: "client-1",
      },
      clientTs,
      schemaVersion: 1,
    },
  });

const reduceEventToState = ({ repositoryState, event }) => {
  const applyResult = applyCommandToRepositoryState({
    repositoryState,
    command: repositoryEventToCommand(event),
    projectId,
  });

  if (!applyResult.valid) {
    throw new Error(applyResult.error?.message || "Failed to apply event");
  }

  return applyResult.repositoryState;
};

const reduceEventsToState = ({ repositoryState, events }) => {
  const applyResult = applyRepositoryEventsToRepositoryState({
    repositoryState,
    events,
    projectId,
  });

  if (!applyResult.valid) {
    throw new Error(applyResult.error?.message || "Failed to apply events");
  }

  return applyResult.repositoryState;
};

const createRepositoryState = () => {
  const state = structuredClone(initialProjectData);
  state.project.resolution = {
    width: 1920,
    height: 1080,
  };
  state.story.initialSceneId = sceneId;
  state.scenes = {
    items: {
      [sceneId]: {
        id: sceneId,
        type: "scene",
        name: "Scene 1",
        sections: {
          items: {
            [sectionId]: {
              id: sectionId,
              name: "Section 1",
              lines: {
                items: {},
                tree: [],
              },
            },
            [targetSectionId]: {
              id: targetSectionId,
              name: "Section 2",
              lines: {
                items: {},
                tree: [],
              },
            },
          },
          tree: [{ id: sectionId }, { id: targetSectionId }],
        },
      },
    },
    tree: [{ id: sceneId }],
  };
  return state;
};

const createCheckpointStore = () => ({
  loadMaterializedViewCheckpoint: async () => undefined,
  saveMaterializedViewCheckpoint: async () => {},
  deleteMaterializedViewCheckpoint: async () => {},
});

describe("scene projection compatibility", () => {
  it("replays legacy line commands from main-scene partitions", async () => {
    const initialState = createRepositoryState();
    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createCommandEvent({
        id: "line-create-1",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId,
          lines: [
            {
              lineId,
              data: {
                actions: {},
              },
            },
          ],
          index: 0,
        },
        clientTs: 1,
      }),
      createCommandEvent({
        id: "line-update-1",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
        payload: {
          lineId,
          data: {
            resetStoryAtSection: {
              sectionId: targetSectionId,
            },
          },
          replace: false,
        },
        clientTs: 2,
      }),
    ];

    const projection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState: createMainProjectionState(initialState),
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    expect(
      projection.scenes.items[sceneId].sections.items[sectionId].lines.items[
        lineId
      ].actions,
    ).toMatchObject({
      resetStoryAtSection: {
        sectionId: targetSectionId,
      },
    });
  });

  it("falls back to a stale scene checkpoint when project.create seed is missing", async () => {
    const initialState = createRepositoryState();
    initialState.scenes.items[sceneId].sections.items[sectionId].lines.items[
      lineId
    ] = {
      id: lineId,
      actions: {},
    };
    initialState.scenes.items[sceneId].sections.items[sectionId].lines.tree = [
      { id: lineId },
    ];

    const events = [
      createCommandEvent({
        id: "line-update-only",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
        payload: {
          lineId,
          data: {
            resetStoryAtSection: {
              sectionId: targetSectionId,
            },
          },
          replace: false,
        },
        clientTs: 1,
      }),
    ];

    const projection = await loadSceneProjectionState({
      store: {
        async loadMaterializedViewCheckpoint() {
          return {
            viewVersion: String(Number(SCENE_VIEW_VERSION) - 1),
            lastCommittedId: 0,
            value: createSceneProjectionState(
              initialState,
              scenePartitionFor(sceneId),
            ),
          };
        },
        async saveMaterializedViewCheckpoint() {},
        async deleteMaterializedViewCheckpoint() {},
      },
      mainState: createMainProjectionState(initialState),
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    expect(
      projection.scenes.items[sceneId].sections.items[sectionId].lines.items[
        lineId
      ].actions,
    ).toMatchObject({
      resetStoryAtSection: {
        sectionId: targetSectionId,
      },
    });
  });

  it("uses batched replay for relevant scene events after bootstrap", async () => {
    const initialState = createRepositoryState();
    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createCommandEvent({
        id: "line-create-1",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId,
          lines: [
            {
              lineId,
              data: {
                actions: {},
              },
            },
          ],
          index: 0,
        },
        clientTs: 1,
      }),
      createCommandEvent({
        id: "line-update-1",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
        payload: {
          lineId,
          data: {
            resetStoryAtSection: {
              sectionId: targetSectionId,
            },
          },
          replace: false,
        },
        clientTs: 2,
      }),
    ];

    const singleEventReducer = vi.fn(reduceEventToState);
    const batchedReducer = vi.fn(({ repositoryState, events }) => {
      const applyResult = applyRepositoryEventsToRepositoryState({
        repositoryState,
        events,
        projectId,
      });
      if (!applyResult.valid) {
        throw new Error(
          applyResult.error?.message || "Failed to apply batched events",
        );
      }

      return applyResult.repositoryState;
    });

    const projection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState: createMainProjectionState(initialState),
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState: singleEventReducer,
      reduceEventsToState: batchedReducer,
      sceneId,
    });

    expect(singleEventReducer).toHaveBeenCalledTimes(1);
    expect(batchedReducer).toHaveBeenCalledTimes(1);
    expect(batchedReducer.mock.calls[0][0].events).toHaveLength(2);
    expect(
      projection.scenes.items[sceneId].sections.items[sectionId].lines.items[
        lineId
      ].actions,
    ).toMatchObject({
      resetStoryAtSection: {
        sectionId: targetSectionId,
      },
    });
  });

  it("pages committed history for scene projection replay without a full event array", async () => {
    const initialState = createRepositoryState();
    const committedEvents = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createCommandEvent({
        id: "line-create-1",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId,
          lines: [
            {
              lineId,
              data: {
                actions: {},
              },
            },
          ],
          index: 0,
        },
        clientTs: 1,
      }),
      createCommandEvent({
        id: "line-update-1",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
        payload: {
          lineId,
          data: {
            resetStoryAtSection: {
              sectionId: targetSectionId,
            },
          },
          replace: false,
        },
        clientTs: 2,
      }),
    ].map((event, index) => ({
      ...structuredClone(event),
      committedId: index + 1,
    }));

    const listCommittedAfter = vi.fn(
      async ({ sinceCommittedId = 0, limit } = {}) => {
        const startIndex = Math.max(0, Number(sinceCommittedId) || 0);
        const normalizedLimit =
          Number.isInteger(limit) && limit > 0 ? limit : committedEvents.length;
        return committedEvents
          .slice(startIndex, startIndex + normalizedLimit)
          .map((event) => structuredClone(event));
      },
    );
    const singleEventReducer = vi.fn(reduceEventToState);
    const batchedReducer = vi.fn(({ repositoryState, events }) => {
      const applyResult = applyRepositoryEventsToRepositoryState({
        repositoryState,
        events,
        projectId,
      });
      if (!applyResult.valid) {
        throw new Error(
          applyResult.error?.message || "Failed to apply batched events",
        );
      }

      return applyResult.repositoryState;
    });

    const projection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState: createMainProjectionState(initialState),
      listCommittedAfter,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState: singleEventReducer,
      reduceEventsToState: batchedReducer,
      sceneId,
    });

    expect(listCommittedAfter).toHaveBeenCalled();
    expect(singleEventReducer).toHaveBeenCalledTimes(1);
    expect(batchedReducer).toHaveBeenCalledTimes(1);
    expect(
      projection.scenes.items[sceneId].sections.items[sectionId].lines.items[
        lineId
      ].actions,
    ).toMatchObject({
      resetStoryAtSection: {
        sectionId: targetSectionId,
      },
    });
  });
});
