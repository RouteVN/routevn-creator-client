import { describe, expect, it, vi } from "vitest";
import {
  createProjectCreateRepositoryEvent,
  applyCommandToRepositoryState,
  applyRepositoryEventsToRepositoryState,
  initialProjectData,
  repositoryEventToCommand,
  createRepositoryCommandEvent,
} from "../../src/deps/services/shared/projectRepository.js";
import {
  applySceneEventsToLoadedProjection,
  loadSceneProjectionState,
} from "../../src/deps/services/shared/projectRepositoryViews/sceneStateView.js";
import {
  SCENE_VIEW_VERSION,
  createMainProjectionState,
  createSceneProjectionState,
} from "../../src/deps/services/shared/projectRepositoryViews/shared.js";
import {
  mainPartitionFor,
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

// Like the repository reducer, report which event failed.
const reduceEventsToStateWithIndex = ({ repositoryState, events }) => {
  const applyResult = applyRepositoryEventsToRepositoryState({
    repositoryState,
    events,
    projectId,
  });

  if (!applyResult.valid) {
    const error = new Error(applyResult.error?.message);
    error.details = applyResult.error?.details;
    throw error;
  }

  return applyResult.repositoryState;
};

const createLineEvent = ({ id, createdLineId, index, clientTs }) =>
  createCommandEvent({
    id,
    partition: scenePartitionFor(sceneId),
    type: COMMAND_TYPES.LINE_CREATE,
    payload: {
      sectionId,
      lines: [
        {
          lineId: createdLineId,
          data: {
            actions: {},
          },
        },
      ],
      index,
    },
    clientTs,
  });

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

  it("preserves moved section lines through target scene partition replay", async () => {
    const targetSceneId = "scene-2";
    const initialState = createRepositoryState();
    initialState.scenes.items[targetSceneId] = {
      id: targetSceneId,
      type: "scene",
      name: "Scene 2",
      sections: {
        items: {},
        tree: [],
      },
    };
    initialState.scenes.tree.push({ id: targetSceneId });

    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createCommandEvent({
        id: "line-create-source",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId,
          lines: [
            {
              lineId,
              data: {
                actions: {
                  say: "kept",
                },
              },
            },
          ],
          index: 0,
        },
        clientTs: 1,
      }),
      createCommandEvent({
        id: "line-delete-source",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_DELETE,
        payload: {
          lineIds: [lineId],
        },
        clientTs: 2,
      }),
      createCommandEvent({
        id: "section-move-target",
        partition: mainPartitionFor(),
        type: COMMAND_TYPES.SECTION_MOVE,
        payload: {
          sectionId,
          sceneId: targetSceneId,
          position: "last",
        },
        clientTs: 3,
      }),
      createCommandEvent({
        id: "line-create-target",
        partition: scenePartitionFor(targetSceneId),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId,
          lines: [
            {
              lineId,
              data: {
                actions: {
                  say: "kept",
                },
              },
            },
          ],
          position: "last",
        },
        clientTs: 4,
      }),
    ];

    const fullReplayResult = applyRepositoryEventsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      events,
      projectId,
    });
    expect(fullReplayResult.valid).toBe(true);
    expect(
      fullReplayResult.repositoryState.scenes.items[targetSceneId].sections
        .items[sectionId].lines.items[lineId].actions,
    ).toEqual({
      say: "kept",
    });

    const mainEvents = events.filter(
      (event) =>
        event.partition === mainPartitionFor() ||
        event.partition === mainScenePartitionFor(sceneId) ||
        event.partition === mainScenePartitionFor(targetSceneId),
    );
    const appliedResult = applyRepositoryEventsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      events: mainEvents,
      projectId,
    });
    expect(appliedResult.valid).toBe(true);

    const mainState = createMainProjectionState(appliedResult.repositoryState);
    const targetProjection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState,
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId: targetSceneId,
    });
    const sourceProjection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState,
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    expect(
      targetProjection.scenes.items[targetSceneId].sections.items[sectionId]
        .lines.items[lineId].actions,
    ).toEqual({
      say: "kept",
    });
    expect(
      sourceProjection.scenes.items[sceneId].sections.items[sectionId],
    ).toBeUndefined();
  });

  it("skips obsolete source line deletes during active scene projection refresh", () => {
    const targetSceneId = "scene-2";
    const initialState = createRepositoryState();
    initialState.scenes.items[sceneId].sections.items[sectionId].lines.items[
      lineId
    ] = {
      id: lineId,
      actions: {
        say: "kept",
      },
    };
    initialState.scenes.items[sceneId].sections.items[sectionId].lines.tree = [
      { id: lineId },
    ];
    initialState.scenes.items[targetSceneId] = {
      id: targetSceneId,
      type: "scene",
      name: "Scene 2",
      sections: {
        items: {},
        tree: [],
      },
    };
    initialState.scenes.tree.push({ id: targetSceneId });

    const lineDeleteEvent = createCommandEvent({
      id: "line-delete-source",
      partition: scenePartitionFor(sceneId),
      type: COMMAND_TYPES.LINE_DELETE,
      payload: {
        lineIds: [lineId],
      },
      clientTs: 1,
    });
    const sectionMoveEvent = createCommandEvent({
      id: "section-move-target",
      partition: mainPartitionFor(),
      type: COMMAND_TYPES.SECTION_MOVE,
      payload: {
        sectionId,
        sceneId: targetSceneId,
        position: "last",
      },
      clientTs: 2,
    });
    const mainReplayResult = applyRepositoryEventsToRepositoryState({
      repositoryState: structuredClone(initialState),
      events: [sectionMoveEvent],
      projectId,
    });
    expect(mainReplayResult.valid).toBe(true);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const projection = applySceneEventsToLoadedProjection({
        mainState: createMainProjectionState(mainReplayResult.repositoryState),
        sceneState: createSceneProjectionState(
          initialState,
          scenePartitionFor(sceneId),
        ),
        sceneId,
        sourceEvents: [lineDeleteEvent],
        reduceEventsToState,
      });

      expect(
        projection.scenes.items[sceneId].sections.items[sectionId],
      ).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        "[sceneProjection] skipped obsolete replay event",
        expect.objectContaining({
          sceneId,
          eventId: "line-delete-source",
          partition: scenePartitionFor(sceneId),
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
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

  it("replays section lifecycle events from main-scene partitions before scene line events", async () => {
    const initialState = createRepositoryState();
    delete initialState.scenes.items[sceneId].sections.items[targetSectionId];
    initialState.scenes.items[sceneId].sections.tree = [{ id: sectionId }];

    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createCommandEvent({
        id: "section-create-1",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.SECTION_CREATE,
        payload: {
          sceneId,
          sectionId: targetSectionId,
          parentId: null,
          index: 1,
          data: {
            name: "Section 2",
          },
        },
        clientTs: 1,
      }),
      createCommandEvent({
        id: "line-create-1",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId: targetSectionId,
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
        clientTs: 2,
      }),
      createCommandEvent({
        id: "section-delete-1",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.SECTION_DELETE,
        payload: {
          sectionIds: [targetSectionId],
        },
        clientTs: 3,
      }),
    ];

    let finalRepositoryState = structuredClone(initialProjectData);
    for (const event of events) {
      finalRepositoryState = reduceEventToState({
        repositoryState: finalRepositoryState,
        event,
      });
    }

    const projection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState: createMainProjectionState(finalRepositoryState),
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    expect(
      projection.scenes.items[sceneId].sections.items[targetSectionId],
    ).toBeUndefined();
  });

  it("skips obsolete plural section delete replay events", async () => {
    const initialState = createRepositoryState();
    delete initialState.scenes.items[sceneId].sections.items[targetSectionId];
    initialState.scenes.items[sceneId].sections.tree = [{ id: sectionId }];

    const projectCreateEvent = createProjectCreateRepositoryEvent({
      projectId,
      state: initialState,
    });
    const sectionDeleteEvent = createCommandEvent({
      id: "section-delete-missing",
      partition: mainScenePartitionFor(sceneId),
      type: COMMAND_TYPES.SECTION_DELETE,
      payload: {
        sectionIds: [targetSectionId],
      },
      clientTs: 1,
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const projection = await loadSceneProjectionState({
        store: createCheckpointStore(),
        mainState: createMainProjectionState(initialState),
        events: [projectCreateEvent, sectionDeleteEvent],
        createInitialState: () => structuredClone(initialProjectData),
        reduceEventToState,
        reduceEventsToState,
        sceneId,
      });

      expect(
        projection.scenes.items[sceneId].sections.items[targetSectionId],
      ).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        "[sceneProjection] skipped obsolete replay event",
        expect.objectContaining({
          sceneId,
          eventId: "section-delete-missing",
          partition: mainScenePartitionFor(sceneId),
          error: "payload.sectionIds must reference existing sections",
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("replays the events around an obsolete event together", async () => {
    const initialState = createRepositoryState();
    delete initialState.scenes.items[sceneId].sections.items[targetSectionId];
    initialState.scenes.items[sceneId].sections.tree = [{ id: sectionId }];

    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createLineEvent({
        id: "line-create-1",
        createdLineId: "line-1",
        index: 0,
        clientTs: 1,
      }),
      createCommandEvent({
        id: "section-delete-missing",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.SECTION_DELETE,
        payload: {
          sectionIds: [targetSectionId],
        },
        clientTs: 2,
      }),
      createLineEvent({
        id: "line-create-2",
        createdLineId: "line-2",
        index: 1,
        clientTs: 3,
      }),
    ];
    const reduceEventToStateSpy = vi.fn(reduceEventToState);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const projection = await loadSceneProjectionState({
        store: createCheckpointStore(),
        mainState: createMainProjectionState(initialState),
        events,
        createInitialState: () => structuredClone(initialProjectData),
        reduceEventToState: reduceEventToStateSpy,
        reduceEventsToState: reduceEventsToStateWithIndex,
        sceneId,
      });

      expect(
        projection.scenes.items[sceneId].sections.items[
          sectionId
        ].lines.tree.map((line) => line.id),
      ).toEqual(["line-1", "line-2"]);
      // The project.create seed, then only the obsolete event on its own.
      expect(
        reduceEventToStateSpy.mock.calls.map(([{ event }]) => event.id),
      ).toEqual([events[0].id, "section-delete-missing"]);
      expect(warnSpy).toHaveBeenCalledWith(
        "[sceneProjection] skipped obsolete replay event",
        expect.objectContaining({
          eventId: "section-delete-missing",
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("skips obsolete section and line lifecycle events while preserving newer scene lines", async () => {
    const initialState = createRepositoryState();
    const deletedSectionId = "section-deleted";
    const deletedLineId = "line-deleted";
    const currentSectionId = "section-current";
    const currentLineId = "line-current";

    delete initialState.scenes.items[sceneId].sections.items[targetSectionId];
    initialState.scenes.items[sceneId].sections.tree = [{ id: sectionId }];

    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createCommandEvent({
        id: "section-create-deleted",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.SECTION_CREATE,
        payload: {
          sceneId,
          sectionId: deletedSectionId,
          parentId: null,
          index: 1,
          data: {
            name: "Deleted Section",
          },
        },
        clientTs: 1,
      }),
      createCommandEvent({
        id: "line-create-deleted",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId: deletedSectionId,
          lines: [
            {
              lineId: deletedLineId,
              data: {
                actions: {},
              },
            },
          ],
          index: 0,
        },
        clientTs: 2,
      }),
      createCommandEvent({
        id: "section-delete-deleted",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.SECTION_DELETE,
        payload: {
          sectionIds: [deletedSectionId],
        },
        clientTs: 3,
      }),
      createCommandEvent({
        id: "section-create-current",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.SECTION_CREATE,
        payload: {
          sceneId,
          sectionId: currentSectionId,
          parentId: null,
          index: 1,
          data: {
            name: "Current Section",
          },
        },
        clientTs: 4,
      }),
      createCommandEvent({
        id: "line-create-current",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_CREATE,
        payload: {
          sectionId: currentSectionId,
          lines: [
            {
              lineId: currentLineId,
              data: {
                actions: {},
              },
            },
          ],
          index: 0,
        },
        clientTs: 5,
      }),
      createCommandEvent({
        id: "line-update-current",
        partition: scenePartitionFor(sceneId),
        type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
        payload: {
          lineId: currentLineId,
          data: {
            resetStoryAtSection: {
              sectionId,
            },
          },
          replace: false,
        },
        clientTs: 6,
      }),
    ];

    let finalRepositoryState = structuredClone(initialProjectData);
    for (const event of events) {
      finalRepositoryState = reduceEventToState({
        repositoryState: finalRepositoryState,
        event,
      });
    }

    const projection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState: createMainProjectionState(finalRepositoryState),
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    expect(
      projection.scenes.items[sceneId].sections.items[deletedSectionId],
    ).toBeUndefined();
    expect(
      projection.scenes.items[sceneId].sections.items[currentSectionId].lines
        .items[currentLineId].actions,
    ).toMatchObject({
      resetStoryAtSection: {
        sectionId,
      },
    });
  });

  it("skips duplicate line create events that use payload.lines line ids", async () => {
    const initialState = createRepositoryState();
    const lineCreatePayload = {
      sectionId,
      lines: [
        {
          lineId,
          data: {
            actions: {
              dialogue: {
                content: [{ text: "Hello" }],
              },
            },
          },
        },
      ],
      index: 0,
    };
    const projectCreateEvent = createProjectCreateRepositoryEvent({
      projectId,
      state: initialState,
    });
    const lineCreateEvent = createCommandEvent({
      id: "line-create-current",
      partition: scenePartitionFor(sceneId),
      type: COMMAND_TYPES.LINE_CREATE,
      payload: lineCreatePayload,
      clientTs: 1,
    });
    const duplicateLineCreateEvent = createCommandEvent({
      id: "line-create-current-duplicate",
      partition: scenePartitionFor(sceneId),
      type: COMMAND_TYPES.LINE_CREATE,
      payload: lineCreatePayload,
      clientTs: 2,
    });

    const finalRepositoryState = reduceEventsToState({
      repositoryState: structuredClone(initialProjectData),
      events: [projectCreateEvent, lineCreateEvent],
    });

    const projection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState: createMainProjectionState(finalRepositoryState),
      events: [projectCreateEvent, lineCreateEvent, duplicateLineCreateEvent],
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    expect(
      projection.scenes.items[sceneId].sections.items[sectionId].lines.items[
        lineId
      ].actions.dialogue.content,
    ).toEqual([{ text: "Hello" }]);
  });
});

describe("scene projection replay after section deletes", () => {
  const otherSectionId = "section-3";
  const otherLineId = "line-2";

  // One scene with Section 1 holding one line.
  const createSceneWithOneLine = () => {
    const state = createRepositoryState();
    const sections = state.scenes.items[sceneId].sections;
    delete sections.items[targetSectionId];
    sections.tree = [{ id: sectionId }];
    sections.items[sectionId].lines = {
      items: {
        [lineId]: {
          id: lineId,
          actions: {},
        },
      },
      tree: [{ id: lineId }],
    };
    return state;
  };

  const createSectionEvent = ({
    id,
    newSectionId,
    name,
    position,
    positionTargetId,
  }) => {
    const payload = {
      sceneId,
      sectionId: newSectionId,
      parentId: null,
      data: {
        name,
      },
      position,
    };
    if (positionTargetId) {
      payload.positionTargetId = positionTargetId;
    }

    return createCommandEvent({
      id,
      partition: mainScenePartitionFor(sceneId),
      type: COMMAND_TYPES.SECTION_CREATE,
      payload,
      clientTs: 1,
    });
  };

  const createLineEvent = ({ id, toSectionId, newLineId }) =>
    createCommandEvent({
      id,
      partition: scenePartitionFor(sceneId),
      type: COMMAND_TYPES.LINE_CREATE,
      payload: {
        sectionId: toSectionId,
        lines: [
          {
            lineId: newLineId,
            data: {
              actions: {},
            },
          },
        ],
        position: "last",
      },
      clientTs: 1,
    });

  const deleteSectionsEvent = ({ id, sectionIds }) =>
    createCommandEvent({
      id,
      partition: mainScenePartitionFor(sceneId),
      type: COMMAND_TYPES.SECTION_DELETE,
      payload: {
        sectionIds,
      },
      clientTs: 1,
    });

  const moveLineEvent = ({ id, toSectionId }) =>
    createCommandEvent({
      id,
      partition: scenePartitionFor(sceneId),
      type: COMMAND_TYPES.LINE_MOVE,
      payload: {
        lineId,
        toSectionId,
        position: "last",
      },
      clientTs: 1,
    });

  const replayAll = (repositoryState, events) =>
    events.reduce(
      (state, event) => reduceEventToState({ repositoryState: state, event }),
      structuredClone(repositoryState),
    );

  const getSectionLineIds = (projection, id) =>
    projection.scenes.items[sceneId].sections.items[id]?.lines.tree.map(
      (line) => line.id,
    );

  it("replays a section duplicated next to a section that was deleted later", async () => {
    const initialState = createSceneWithOneLine();
    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createSectionEvent({
        id: "duplicate-1",
        newSectionId: targetSectionId,
        name: "Section 1 copy",
        position: "after",
        positionTargetId: sectionId,
      }),
      createLineEvent({
        id: "duplicate-1-line",
        toSectionId: targetSectionId,
        newLineId: otherLineId,
      }),
      createSectionEvent({
        id: "duplicate-2",
        newSectionId: otherSectionId,
        name: "Section 1 copy",
        position: "after",
        positionTargetId: sectionId,
      }),
      deleteSectionsEvent({
        id: "delete-original",
        sectionIds: [sectionId],
      }),
      deleteSectionsEvent({
        id: "delete-second-copy",
        sectionIds: [otherSectionId],
      }),
    ];
    const finalState = replayAll(initialProjectData, events);

    const projection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState: createMainProjectionState(finalState),
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    const sections = projection.scenes.items[sceneId].sections;
    expect(Object.keys(sections.items)).toEqual([targetSectionId]);
    expect(sections.tree).toEqual(
      finalState.scenes.items[sceneId].sections.tree,
    );
    expect(getSectionLineIds(projection, targetSectionId)).toEqual([
      otherLineId,
    ]);
  });

  it("keeps a line moved out of a section that was deleted later", async () => {
    const initialState = createSceneWithOneLine();
    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createSectionEvent({
        id: "create-section-2",
        newSectionId: targetSectionId,
        name: "Section 2",
        position: "last",
      }),
      moveLineEvent({
        id: "move-line",
        toSectionId: targetSectionId,
      }),
      deleteSectionsEvent({
        id: "delete-section-1",
        sectionIds: [sectionId],
      }),
    ];
    const finalState = replayAll(initialProjectData, events);

    const projection = await loadSceneProjectionState({
      store: createCheckpointStore(),
      mainState: createMainProjectionState(finalState),
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    expect(getSectionLineIds(projection, targetSectionId)).toEqual([lineId]);
  });

  it("replays from a stale checkpoint after a section moved above a section that was deleted later", async () => {
    const checkpointState = createSceneWithOneLine();
    const events = [
      createSectionEvent({
        id: "create-section-2",
        newSectionId: targetSectionId,
        name: "Section 2",
        position: "last",
      }),
      createLineEvent({
        id: "create-section-2-line",
        toSectionId: targetSectionId,
        newLineId: otherLineId,
      }),
      createCommandEvent({
        id: "move-section-2-up",
        partition: mainScenePartitionFor(sceneId),
        type: COMMAND_TYPES.SECTION_MOVE,
        payload: {
          sectionId: targetSectionId,
          parentId: null,
          position: "before",
          positionTargetId: sectionId,
        },
        clientTs: 1,
      }),
      deleteSectionsEvent({
        id: "delete-section-1",
        sectionIds: [sectionId],
      }),
    ];
    const finalState = replayAll(checkpointState, events);

    const projection = await loadSceneProjectionState({
      store: {
        async loadMaterializedViewCheckpoint() {
          return {
            viewVersion: SCENE_VIEW_VERSION,
            lastCommittedId: 0,
            value: createSceneProjectionState(
              checkpointState,
              scenePartitionFor(sceneId),
            ),
          };
        },
        async saveMaterializedViewCheckpoint() {},
        async deleteMaterializedViewCheckpoint() {},
      },
      mainState: createMainProjectionState(finalState),
      events,
      createInitialState: () => structuredClone(initialProjectData),
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

    const sections = projection.scenes.items[sceneId].sections;
    expect(Object.keys(sections.items)).toEqual([targetSectionId]);
    expect(getSectionLineIds(projection, targetSectionId)).toEqual([
      otherLineId,
    ]);
  });

  it("keeps a moved line when the active scene's old section is already deleted", () => {
    const initialState = createSceneWithOneLine();
    const lineMove = moveLineEvent({
      id: "move-line",
      toSectionId: targetSectionId,
    });
    const finalState = replayAll(initialState, [
      createSectionEvent({
        id: "create-section-2",
        newSectionId: targetSectionId,
        name: "Section 2",
        position: "last",
      }),
      lineMove,
      deleteSectionsEvent({
        id: "delete-section-1",
        sectionIds: [sectionId],
      }),
    ]);

    const projection = applySceneEventsToLoadedProjection({
      mainState: createMainProjectionState(finalState),
      sceneState: createSceneProjectionState(
        initialState,
        scenePartitionFor(sceneId),
      ),
      sceneId,
      sourceEvents: [lineMove],
      reduceEventsToState,
    });

    expect(
      projection.scenes.items[sceneId].sections.items[sectionId],
    ).toBeUndefined();
    expect(getSectionLineIds(projection, targetSectionId)).toEqual([lineId]);
  });
});

describe("scene projection replay of a failed batch", () => {
  const createRepositoryStateWithOneSection = () => {
    const state = createRepositoryState();
    delete state.scenes.items[sceneId].sections.items[targetSectionId];
    state.scenes.items[sceneId].sections.tree = [{ id: sectionId }];
    return state;
  };
  const createObsoleteLineDeleteEvent = ({ id, clientTs }) =>
    createCommandEvent({
      id,
      partition: scenePartitionFor(sceneId),
      type: COMMAND_TYPES.LINE_DELETE,
      payload: {
        lineIds: ["line-missing"],
      },
      clientTs,
    });
  const createInvalidLineCreateEvent = ({ id, clientTs }) =>
    createCommandEvent({
      id,
      partition: scenePartitionFor(sceneId),
      type: COMMAND_TYPES.LINE_CREATE,
      payload: {
        sectionId,
        lines: [],
        index: 0,
      },
      clientTs,
    });
  const toLineIds = (projection) =>
    projection.scenes.items[sceneId].sections.items[sectionId].lines.tree.map(
      (line) => line.id,
    );
  const toEventIds = (spy) => spy.mock.calls.map(([{ event }]) => event.id);
  const toBatchEventIds = (spy) =>
    spy.mock.calls.map(([{ events }]) => events.map((event) => event.id));

  it("replays only the failed events on their own while loading a scene", async () => {
    const initialState = createRepositoryStateWithOneSection();
    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createLineEvent({
        id: "line-create-1",
        createdLineId: "line-1",
        index: 0,
        clientTs: 1,
      }),
      createObsoleteLineDeleteEvent({ id: "line-delete-1", clientTs: 2 }),
      createLineEvent({
        id: "line-create-2",
        createdLineId: "line-2",
        index: 1,
        clientTs: 3,
      }),
      createObsoleteLineDeleteEvent({ id: "line-delete-2", clientTs: 4 }),
      createLineEvent({
        id: "line-create-3",
        createdLineId: "line-3",
        index: 2,
        clientTs: 5,
      }),
    ];
    const reduceEventToStateSpy = vi.fn(reduceEventToState);
    const reduceEventsToStateSpy = vi.fn(reduceEventsToStateWithIndex);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const projection = await loadSceneProjectionState({
        store: createCheckpointStore(),
        mainState: createMainProjectionState(initialState),
        events,
        createInitialState: () => structuredClone(initialProjectData),
        reduceEventToState: reduceEventToStateSpy,
        reduceEventsToState: reduceEventsToStateSpy,
        sceneId,
      });

      expect(toLineIds(projection)).toEqual(["line-1", "line-2", "line-3"]);
      // The project.create seed, then only the obsolete events.
      expect(toEventIds(reduceEventToStateSpy)).toEqual([
        events[0].id,
        "line-delete-1",
        "line-delete-2",
      ]);
      expect(toBatchEventIds(reduceEventsToStateSpy)).toEqual([
        [
          "line-create-1",
          "line-delete-1",
          "line-create-2",
          "line-delete-2",
          "line-create-3",
        ],
        ["line-create-1"],
        ["line-create-2", "line-delete-2", "line-create-3"],
        ["line-create-2"],
        ["line-create-3"],
      ]);
      expect(
        warnSpy.mock.calls.map(([message, details]) => [
          message,
          details.eventId,
        ]),
      ).toEqual([
        ["[sceneProjection] skipped obsolete replay event", "line-delete-1"],
        ["[sceneProjection] skipped obsolete replay event", "line-delete-2"],
      ]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("replays a scene batch one event at a time when its failure has no event index", async () => {
    const initialState = createRepositoryStateWithOneSection();
    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createLineEvent({
        id: "line-create-1",
        createdLineId: "line-1",
        index: 0,
        clientTs: 1,
      }),
      createObsoleteLineDeleteEvent({ id: "line-delete-1", clientTs: 2 }),
      createLineEvent({
        id: "line-create-2",
        createdLineId: "line-2",
        index: 1,
        clientTs: 3,
      }),
    ];
    const reduceEventToStateSpy = vi.fn(reduceEventToState);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const projection = await loadSceneProjectionState({
        store: createCheckpointStore(),
        mainState: createMainProjectionState(initialState),
        events,
        createInitialState: () => structuredClone(initialProjectData),
        reduceEventToState: reduceEventToStateSpy,
        reduceEventsToState,
        sceneId,
      });

      expect(toLineIds(projection)).toEqual(["line-1", "line-2"]);
      expect(toEventIds(reduceEventToStateSpy)).toEqual([
        events[0].id,
        "line-create-1",
        "line-delete-1",
        "line-create-2",
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        "[sceneProjection] skipped obsolete replay event",
        expect.objectContaining({
          sceneId,
          eventId: "line-delete-1",
          partition: scenePartitionFor(sceneId),
          error: "payload.lineIds must reference existing lines",
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("throws for a failed scene event that is not obsolete", async () => {
    const initialState = createRepositoryStateWithOneSection();
    const events = [
      createProjectCreateRepositoryEvent({
        projectId,
        state: initialState,
      }),
      createLineEvent({
        id: "line-create-1",
        createdLineId: "line-1",
        index: 0,
        clientTs: 1,
      }),
      createObsoleteLineDeleteEvent({ id: "line-delete-1", clientTs: 2 }),
      createInvalidLineCreateEvent({ id: "line-create-invalid", clientTs: 3 }),
      createLineEvent({
        id: "line-create-2",
        createdLineId: "line-2",
        index: 1,
        clientTs: 4,
      }),
    ];
    const reduceEventToStateSpy = vi.fn(reduceEventToState);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        loadSceneProjectionState({
          store: createCheckpointStore(),
          mainState: createMainProjectionState(initialState),
          events,
          createInitialState: () => structuredClone(initialProjectData),
          reduceEventToState: reduceEventToStateSpy,
          reduceEventsToState: reduceEventsToStateWithIndex,
          sceneId,
        }),
      ).rejects.toThrow("payload.lines must be a non-empty array");

      expect(toEventIds(reduceEventToStateSpy)).toEqual([
        events[0].id,
        "line-delete-1",
        "line-create-invalid",
      ]);
      expect(errorSpy).toHaveBeenCalledWith(
        "[sceneProjection] replay failed",
        expect.objectContaining({
          sceneId,
          index: 3,
          error: "payload.lines must be a non-empty array",
        }),
      );
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  const loadOpenSceneProjection = ({ sourceEvents, reduceEventsToState }) => {
    const initialState = createRepositoryStateWithOneSection();
    return applySceneEventsToLoadedProjection({
      mainState: createMainProjectionState(initialState),
      sceneState: createSceneProjectionState(
        initialState,
        scenePartitionFor(sceneId),
      ),
      sceneId,
      sourceEvents,
      reduceEventsToState,
    });
  };
  const createOpenSceneEvents = () => [
    createLineEvent({
      id: "line-create-1",
      createdLineId: "line-1",
      index: 0,
      clientTs: 1,
    }),
    createLineEvent({
      id: "line-create-2",
      createdLineId: "line-2",
      index: 1,
      clientTs: 2,
    }),
    createObsoleteLineDeleteEvent({ id: "line-delete-1", clientTs: 3 }),
    createLineEvent({
      id: "line-create-3",
      createdLineId: "line-3",
      index: 2,
      clientTs: 4,
    }),
    createLineEvent({
      id: "line-create-4",
      createdLineId: "line-4",
      index: 3,
      clientTs: 5,
    }),
  ];

  it("replays only the failed event on its own in the open scene", () => {
    const reduceEventsToStateSpy = vi.fn(reduceEventsToStateWithIndex);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const projection = loadOpenSceneProjection({
        sourceEvents: createOpenSceneEvents(),
        reduceEventsToState: reduceEventsToStateSpy,
      });

      expect(toLineIds(projection)).toEqual([
        "line-1",
        "line-2",
        "line-3",
        "line-4",
      ]);
      expect(toBatchEventIds(reduceEventsToStateSpy)).toEqual([
        [
          "line-create-1",
          "line-create-2",
          "line-delete-1",
          "line-create-3",
          "line-create-4",
        ],
        ["line-create-1", "line-create-2"],
        ["line-delete-1"],
        ["line-create-3", "line-create-4"],
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        "[sceneProjection] skipped obsolete replay event",
        expect.objectContaining({
          sceneId,
          eventId: "line-delete-1",
          partition: scenePartitionFor(sceneId),
          error: "payload.lineIds must reference existing lines",
        }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("replays the open scene one event at a time when a failure has no event index", () => {
    const reduceEventsToStateSpy = vi.fn(reduceEventsToState);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const projection = loadOpenSceneProjection({
        sourceEvents: createOpenSceneEvents(),
        reduceEventsToState: reduceEventsToStateSpy,
      });

      expect(toLineIds(projection)).toEqual([
        "line-1",
        "line-2",
        "line-3",
        "line-4",
      ]);
      expect(toBatchEventIds(reduceEventsToStateSpy)).toEqual([
        [
          "line-create-1",
          "line-create-2",
          "line-delete-1",
          "line-create-3",
          "line-create-4",
        ],
        ["line-create-1"],
        ["line-create-2"],
        ["line-delete-1"],
        ["line-create-3"],
        ["line-create-4"],
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("throws for a failed open scene event that is not obsolete", () => {
    const sourceEvents = createOpenSceneEvents();
    sourceEvents.splice(
      3,
      0,
      createInvalidLineCreateEvent({ id: "line-create-invalid", clientTs: 6 }),
    );
    const reduceEventsToStateSpy = vi.fn(reduceEventsToStateWithIndex);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        loadOpenSceneProjection({
          sourceEvents,
          reduceEventsToState: reduceEventsToStateSpy,
        }),
      ).toThrow("payload.lines must be a non-empty array");

      expect(toBatchEventIds(reduceEventsToStateSpy).slice(1)).toEqual([
        ["line-create-1", "line-create-2"],
        ["line-delete-1"],
        ["line-create-invalid", "line-create-3", "line-create-4"],
        ["line-create-invalid"],
      ]);
      expect(errorSpy).toHaveBeenCalledWith(
        "[sceneProjection] replay failed",
        expect.objectContaining({
          sceneId,
          index: 3,
          error: "payload.lines must be a non-empty array",
        }),
      );
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
