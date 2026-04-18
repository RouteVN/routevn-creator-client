import { describe, expect, it, vi } from "vitest";
import { createProjectCreateRepositoryEvent } from "../../src/deps/services/shared/projectRepository.js";
import {
  createProjectRepositoryRuntime,
  replayEventsToRepositoryState,
} from "../../src/deps/services/shared/projectRepositoryRuntime.js";
import {
  MAIN_VIEW_NAME,
  SCENE_OVERVIEW_VIEW_NAME,
  createMainProjectionState,
} from "../../src/deps/services/shared/projectRepositoryViews/shared.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../../src/deps/services/shared/collab/partitions.js";

const createBatchedReducer = (reduceEventToState) => {
  return ({ repositoryState, events }) => {
    let nextState = repositoryState;

    for (const event of events) {
      const reducedState = reduceEventToState({
        repositoryState: nextState,
        event,
      });
      if (reducedState !== undefined) {
        nextState = reducedState;
      }
    }

    return nextState;
  };
};

const createSceneRepositoryState = ({
  sceneId = "scene-1",
  sectionId = "section-1",
  lineId,
} = {}) => ({
  project: {
    resolution: {
      width: 1280,
      height: 720,
    },
  },
  story: {
    initialSceneId: sceneId,
  },
  files: {
    items: {},
    tree: [],
  },
  images: {
    items: {},
    tree: [],
  },
  spritesheets: {
    items: {},
    tree: [],
  },
  sounds: {
    items: {},
    tree: [],
  },
  videos: {
    items: {},
    tree: [],
  },
  animations: {
    items: {},
    tree: [],
  },
  particles: {
    items: {},
    tree: [],
  },
  characters: {
    items: {},
    tree: [],
  },
  fonts: {
    items: {},
    tree: [],
  },
  transforms: {
    items: {},
    tree: [],
  },
  colors: {
    items: {},
    tree: [],
  },
  textStyles: {
    items: {},
    tree: [],
  },
  variables: {
    items: {},
    tree: [],
  },
  layouts: {
    items: {},
    tree: [],
  },
  controls: {
    items: {},
    tree: [],
  },
  scenes: {
    items: {
      [sceneId]: {
        id: sceneId,
        type: "scene",
        name: "Scene 1",
        sections: {
          items: {
            [sectionId]: {
              id: sectionId,
              type: "section",
              name: "Section 1",
              lines: {
                items: lineId
                  ? {
                      [lineId]: {
                        id: lineId,
                        actions: {},
                      },
                    }
                  : {},
                tree: lineId ? [{ id: lineId }] : [],
              },
            },
          },
          tree: [{ id: sectionId }],
        },
      },
    },
    tree: [{ id: sceneId }],
  },
});

const createSceneProjectionReducer = () => {
  return ({ repositoryState, event }) => {
    if (event?.type === "project.create") {
      return structuredClone(event.payload.state);
    }

    if (event?.type === "section.create") {
      const nextState = structuredClone(repositoryState);
      const scene = nextState?.scenes?.items?.["scene-1"];
      const sectionId = event?.payload?.sectionId;
      if (!scene || typeof sectionId !== "string" || sectionId.length === 0) {
        throw new Error("payload.sceneId must reference an existing scene");
      }

      if (scene.sections.items[sectionId]) {
        throw new Error("payload.sectionId must not already exist");
      }

      scene.sections.items[sectionId] = {
        id: sectionId,
        type: "section",
        name: event?.payload?.data?.name || "Section",
        lines: {
          items: {},
          tree: [],
        },
      };
      scene.sections.tree.splice(Number(event?.payload?.index) || 0, 0, {
        id: sectionId,
      });
      return nextState;
    }

    if (event?.type === "line.create") {
      const nextState = structuredClone(repositoryState);
      const scene = nextState?.scenes?.items?.["scene-1"];
      const sectionId = event?.payload?.sectionId;
      const section = scene?.sections?.items?.[sectionId];
      const line = event?.payload?.lines?.[0];
      if (!section || !line?.lineId) {
        throw new Error("payload.sectionId must reference an existing section");
      }

      if (section.lines.items[line.lineId]) {
        throw new Error("payload.lines.lineId must not already exist");
      }

      section.lines.items[line.lineId] = {
        id: line.lineId,
        ...line.data,
      };
      section.lines.tree.push({
        id: line.lineId,
      });
      return nextState;
    }

    return repositoryState;
  };
};

describe("projectRepositoryRuntime replay diagnostics", () => {
  it("attaches failing event details when historical replay throws", () => {
    const events = [
      {
        id: "event-1",
        type: "scene.create",
        partition: "m",
        payload: {
          sceneId: "scene-1",
        },
      },
      {
        id: "event-2",
        type: "line.create",
        partition: "s:scene-1",
        payload: {
          sectionId: "missing-section",
        },
      },
    ];

    let error;

    try {
      replayEventsToRepositoryState({
        events,
        untilEventIndex: events.length,
        createInitialState: () => ({
          appliedEventIds: [],
        }),
        reduceEventToState: ({ repositoryState, event }) => {
          if (event.id === "event-2") {
            const replayFailure = new Error(
              "payload.sectionId must reference an existing section",
            );

            replayFailure.code = "validation_failed";
            replayFailure.details = {
              sectionId: "missing-section",
            };
            throw replayFailure;
          }

          return {
            ...repositoryState,
            appliedEventIds: [...repositoryState.appliedEventIds, event.id],
          };
        },
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error?.name).toBe("ProjectRepositoryReplayError");
    expect(error?.code).toBe("validation_failed");
    expect(error?.message).toBe(
      "payload.sectionId must reference an existing section",
    );
    expect(error?.details?.sectionId).toBe("missing-section");
    expect(error?.details?.replay).toMatchObject({
      targetEventCount: 2,
      failedEventArrayIndex: 1,
      failedEventOffset: 2,
      failedEvent: {
        arrayIndex: 1,
        eventOffset: 2,
        id: "event-2",
        type: "line.create",
        partition: "s:scene-1",
        payload: {
          sectionId: "missing-section",
        },
      },
    });
    expect(error?.details?.replay?.nearbyEvents).toHaveLength(2);
    expect(error?.cause?.message).toBe(
      "payload.sectionId must reference an existing section",
    );
  });

  it("attaches failing event details when batched historical replay throws", () => {
    const events = [
      {
        id: "event-1",
        type: "scene.create",
        partition: "m",
        payload: {
          sceneId: "scene-1",
        },
      },
      {
        id: "event-2",
        type: "line.create",
        partition: "s:scene-1",
        payload: {
          sectionId: "missing-section",
        },
      },
    ];

    let error;

    try {
      replayEventsToRepositoryState({
        events,
        untilEventIndex: events.length,
        createInitialState: () => ({
          appliedEventIds: [],
        }),
        reduceEventToState: () => {
          throw new Error("reduceEventToState should not be used");
        },
        reduceEventsToState: () => {
          const replayFailure = new Error(
            "payload.sectionId must reference an existing section",
          );

          replayFailure.code = "validation_failed";
          replayFailure.details = {
            sectionId: "missing-section",
            commandIndex: 1,
          };
          throw replayFailure;
        },
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error?.name).toBe("ProjectRepositoryReplayError");
    expect(error?.code).toBe("validation_failed");
    expect(error?.details?.sectionId).toBe("missing-section");
    expect(error?.details?.commandIndex).toBe(1);
    expect(error?.details?.replay).toMatchObject({
      targetEventCount: 2,
      failedEventArrayIndex: 1,
      failedEventOffset: 2,
      failedEvent: {
        id: "event-2",
        type: "line.create",
        partition: "s:scene-1",
      },
    });
  });

  it("reports initial main hydration progress while replaying checkpoint gaps", async () => {
    const events = Array.from({ length: 300 }, (_, index) => ({
      id: `event-${index + 1}`,
      type: "resource.update",
      partition: "m",
      payload: {
        index,
      },
    }));
    const progressUpdates = [];

    const reduceEventToState = ({ repositoryState, event }) => ({
      appliedCount:
        Number(repositoryState?.appliedCount || 0) +
        (Number.isFinite(event?.payload?.index) ? 1 : 0),
    });

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        loadMaterializedViewCheckpoint: async () => ({
          viewName: "project_repository_main_state",
          viewVersion: "1",
          partition: "m",
          lastCommittedId: 0,
          value: {
            appliedCount: 0,
          },
        }),
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      events,
      createInitialState: () => ({
        appliedCount: 0,
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
      onHydrationProgress: (progress) => {
        progressUpdates.push(progress);
      },
    });

    expect(repository.getState()).toEqual({
      appliedCount: 300,
    });
    expect(progressUpdates[0]).toEqual({
      current: 0,
      total: 300,
    });
    expect(progressUpdates).toContainEqual({
      current: 256,
      total: 300,
    });
    expect(progressUpdates.at(-1)).toEqual({
      current: 300,
      total: 300,
    });
  });

  it("boots from a current main checkpoint without loading full history", async () => {
    const loadEvents = vi.fn(async () => [
      {
        id: "event-1",
        type: "resource.update",
        partition: "m",
        payload: {
          index: 1,
        },
      },
    ]);

    const reduceEventToState = ({ repositoryState, event }) => ({
      appliedCount:
        Number(repositoryState?.appliedCount || 0) +
        (Number.isFinite(event?.payload?.index) ? 1 : 0),
    });

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        loadMaterializedViewCheckpoint: async () => ({
          viewName: "project_repository_main_state",
          viewVersion: "1",
          partition: "m",
          lastCommittedId: 1,
          value: {
            appliedCount: 1,
          },
        }),
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: 1,
      loadEvents,
      createInitialState: () => ({
        appliedCount: 0,
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    expect(repository.getState()).toEqual({
      appliedCount: 1,
    });
    expect(loadEvents).not.toHaveBeenCalled();

    const events = await repository.loadEvents();

    expect(loadEvents).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(repository.getState(1)).toEqual({
      appliedCount: 1,
    });
  });

  it("rehydrates the main state from committed batches without loading full history when no drafts exist", async () => {
    const committedEvents = Array.from({ length: 300 }, (_, index) => ({
      id: `event-${index + 1}`,
      committedId: index + 1,
      type: "resource.update",
      partition: "m",
      payload: {
        index,
      },
    }));
    const loadEvents = vi.fn(async () => committedEvents);
    const listCommittedAfter = vi.fn(
      async ({ sinceCommittedId = 0, limit }) => {
        const startIndex = Math.max(0, Number(sinceCommittedId) || 0);
        const normalizedLimit =
          Number.isInteger(limit) && limit > 0 ? limit : committedEvents.length;
        return committedEvents
          .slice(startIndex, startIndex + normalizedLimit)
          .map((event) => structuredClone(event));
      },
    );

    const reduceEventToState = ({ repositoryState, event }) => ({
      appliedCount:
        Number(repositoryState?.appliedCount || 0) +
        (Number.isFinite(event?.payload?.index) ? 1 : 0),
    });

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        listCommittedAfter,
        loadMaterializedViewCheckpoint: async () => ({
          viewName: "project_repository_main_state",
          viewVersion: "1",
          partition: "m",
          lastCommittedId: 0,
          value: {
            appliedCount: 0,
          },
        }),
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: committedEvents.length,
      historyStats: {
        committedCount: committedEvents.length,
        latestCommittedId: committedEvents.length,
        draftCount: 0,
        latestDraftClock: 0,
      },
      loadEvents,
      createInitialState: () => ({
        appliedCount: 0,
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    expect(repository.getState()).toEqual({
      appliedCount: 300,
    });
    expect(loadEvents).not.toHaveBeenCalled();
    expect(listCommittedAfter).toHaveBeenCalled();
  });

  it("loads historical snapshots from committed batches without loading full history when no drafts exist", async () => {
    const committedEvents = Array.from({ length: 4 }, (_, index) => ({
      id: `event-${index + 1}`,
      committedId: index + 1,
      type: "resource.update",
      partition: "m",
      payload: {
        index,
      },
    }));
    const loadEvents = vi.fn(async () => committedEvents);
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

    const reduceEventToState = ({ repositoryState, event }) => ({
      appliedIds: [...(repositoryState?.appliedIds || []), event.id],
    });

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        listCommittedAfter,
        loadMaterializedViewCheckpoint: async () => ({
          viewName: "project_repository_main_state",
          viewVersion: "1",
          partition: "m",
          lastCommittedId: 0,
          value: {
            appliedIds: [],
          },
        }),
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: committedEvents.length,
      historyStats: {
        committedCount: committedEvents.length,
        latestCommittedId: committedEvents.length,
        draftCount: 0,
        latestDraftClock: 0,
      },
      loadEvents,
      createInitialState: () => ({
        appliedIds: [],
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    await expect(repository.loadState(2)).resolves.toEqual({
      appliedIds: ["event-1", "event-2"],
    });

    expect(loadEvents).not.toHaveBeenCalled();
    expect(listCommittedAfter).toHaveBeenCalled();
  });

  it("loads full history before appending new events on a checkpoint-backed repository", async () => {
    const initialEvents = [
      {
        id: "event-1",
        type: "resource.update",
        partition: "m",
        payload: {
          index: 1,
        },
      },
    ];
    const loadEvents = vi.fn(async () => structuredClone(initialEvents));

    const reduceEventToState = ({ repositoryState, event }) => ({
      appliedCount:
        Number(repositoryState?.appliedCount || 0) +
        (Number.isFinite(event?.payload?.index) ? 1 : 0),
    });

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        appendEvent: vi.fn(async () => {}),
        loadMaterializedViewCheckpoint: async () => ({
          viewName: "project_repository_main_state",
          viewVersion: "1",
          partition: "m",
          lastCommittedId: 1,
          value: {
            appliedCount: 1,
          },
        }),
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: 1,
      loadEvents,
      createInitialState: () => ({
        appliedCount: 0,
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    await repository.addEvent({
      id: "event-2",
      type: "resource.update",
      partition: "m",
      payload: {
        index: 2,
      },
    });

    expect(loadEvents).toHaveBeenCalledTimes(1);
    expect(repository.getRevision()).toBe(2);
    await expect(repository.loadEvents()).resolves.toHaveLength(2);
    expect(repository.getState()).toEqual({
      appliedCount: 2,
    });
  });

  it("rebuilds a stale scene overview from paged committed history on a checkpoint-backed repository", async () => {
    const sceneId = "scene-1";
    const mainState = {
      project: {
        resolution: {
          width: 1280,
          height: 720,
        },
      },
      story: {
        initialSceneId: sceneId,
      },
      files: {
        items: {},
        tree: [],
      },
      images: {
        items: {},
        tree: [],
      },
      spritesheets: {
        items: {},
        tree: [],
      },
      sounds: {
        items: {},
        tree: [],
      },
      videos: {
        items: {},
        tree: [],
      },
      animations: {
        items: {},
        tree: [],
      },
      particles: {
        items: {},
        tree: [],
      },
      characters: {
        items: {},
        tree: [],
      },
      fonts: {
        items: {},
        tree: [],
      },
      transforms: {
        items: {},
        tree: [],
      },
      colors: {
        items: {},
        tree: [],
      },
      textStyles: {
        items: {},
        tree: [],
      },
      variables: {
        items: {},
        tree: [],
      },
      layouts: {
        items: {},
        tree: [],
      },
      controls: {
        items: {},
        tree: [],
      },
      scenes: {
        items: {
          [sceneId]: {
            id: sceneId,
            type: "scene",
            name: "Fresh Scene",
            position: {
              x: 10,
              y: 20,
            },
            sections: {
              items: {},
              tree: [],
            },
          },
        },
        tree: [{ id: sceneId }],
      },
    };
    const committedEvents = [
      {
        id: "event-1",
        committedId: 1,
        type: "project.create",
        partition: "m",
        payload: {
          state: structuredClone(mainState),
        },
      },
    ];
    const loadEvents = vi.fn(async () => structuredClone(committedEvents));
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

    const reduceEventToState = ({ repositoryState }) => repositoryState;

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        listCommittedAfter,
        loadMaterializedViewCheckpoint: async ({ viewName, partition }) => {
          if (viewName === MAIN_VIEW_NAME && partition === "m") {
            return {
              viewName,
              viewVersion: "1",
              partition,
              lastCommittedId: 1,
              value: structuredClone(mainState),
            };
          }

          if (
            viewName === SCENE_OVERVIEW_VIEW_NAME &&
            partition === `s:${sceneId}`
          ) {
            return {
              viewName,
              viewVersion: "1",
              partition,
              lastCommittedId: 0,
              value: {
                sceneId,
                name: "Stale Scene",
                position: {
                  x: 0,
                  y: 0,
                },
                outgoingSceneIds: [],
                sections: [],
              },
            };
          }

          return undefined;
        },
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: 1,
      loadEvents,
      createInitialState: () => ({
        appliedCount: 0,
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    const overview = await repository.getSceneOverview(sceneId);

    expect(loadEvents).not.toHaveBeenCalled();
    expect(listCommittedAfter).toHaveBeenCalled();
    expect(overview).toMatchObject({
      sceneId,
      name: "Fresh Scene",
    });
  });

  it("pages committed history when activating a scene on a checkpoint-backed repository without drafts", async () => {
    const sceneId = "scene-1";
    const sectionId = "section-1";
    const lineId = "line-1";
    const fullRepositoryState = {
      project: {
        resolution: {
          width: 1280,
          height: 720,
        },
      },
      story: {
        initialSceneId: sceneId,
      },
      files: {
        items: {},
        tree: [],
      },
      images: {
        items: {},
        tree: [],
      },
      spritesheets: {
        items: {},
        tree: [],
      },
      sounds: {
        items: {},
        tree: [],
      },
      videos: {
        items: {},
        tree: [],
      },
      animations: {
        items: {},
        tree: [],
      },
      particles: {
        items: {},
        tree: [],
      },
      characters: {
        items: {},
        tree: [],
      },
      fonts: {
        items: {},
        tree: [],
      },
      transforms: {
        items: {},
        tree: [],
      },
      colors: {
        items: {},
        tree: [],
      },
      textStyles: {
        items: {},
        tree: [],
      },
      variables: {
        items: {},
        tree: [],
      },
      layouts: {
        items: {},
        tree: [],
      },
      controls: {
        items: {},
        tree: [],
      },
      scenes: {
        items: {
          [sceneId]: {
            id: sceneId,
            type: "scene",
            name: "Projected Scene",
            position: {
              x: 10,
              y: 20,
            },
            sections: {
              items: {
                [sectionId]: {
                  id: sectionId,
                  type: "section",
                  name: "Section 1",
                  lines: {
                    items: {
                      [lineId]: {
                        id: lineId,
                        actions: {},
                      },
                    },
                    tree: [{ id: lineId }],
                  },
                },
              },
              tree: [{ id: sectionId }],
            },
          },
        },
        tree: [{ id: sceneId }],
      },
    };
    const committedEvents = [
      createProjectCreateRepositoryEvent({
        projectId: "project-1",
        state: fullRepositoryState,
      }),
    ].map((event, index) => ({
      ...structuredClone(event),
      committedId: index + 1,
    }));
    const loadEvents = vi.fn(async () => structuredClone(committedEvents));
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

    const reduceEventToState = ({ repositoryState, event }) =>
      event?.payload?.state
        ? structuredClone(event.payload.state)
        : repositoryState;

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        listCommittedAfter,
        loadMaterializedViewCheckpoint: async ({ viewName, partition }) => {
          if (viewName === MAIN_VIEW_NAME && partition === "m") {
            return {
              viewName,
              viewVersion: "1",
              partition,
              lastCommittedId: 1,
              value: createMainProjectionState(fullRepositoryState),
            };
          }

          return undefined;
        },
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: committedEvents.length,
      historyStats: {
        committedCount: committedEvents.length,
        latestCommittedId: committedEvents.length,
        draftCount: 0,
        latestDraftClock: 0,
      },
      loadEvents,
      createInitialState: () => ({
        scenes: {
          items: {},
          tree: [],
        },
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    await repository.setActiveSceneId(sceneId);

    expect(loadEvents).not.toHaveBeenCalled();
    expect(listCommittedAfter).toHaveBeenCalled();
    expect(
      repository.getState().scenes.items[sceneId].sections.items[sectionId]
        .lines.items[lineId],
    ).toMatchObject({
      id: lineId,
    });
  });

  it("normalizes polluted main checkpoints before loading a scene projection", async () => {
    const sceneId = "scene-1";
    const sectionId = "section-1";
    const lineId = "line-1";
    const initialState = createSceneRepositoryState({
      sceneId,
      sectionId,
    });
    const pollutedMainCheckpoint = createSceneRepositoryState({
      sceneId,
      sectionId,
      lineId,
    });
    const committedEvents = [
      createProjectCreateRepositoryEvent({
        projectId: "project-1",
        state: initialState,
      }),
      {
        id: "line-create-1",
        projectId: "project-1",
        type: "line.create",
        partition: scenePartitionFor(sceneId),
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
      },
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
    const reduceEventToState = createSceneProjectionReducer();

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        listCommittedAfter,
        loadMaterializedViewCheckpoint: async ({ viewName, partition }) => {
          if (viewName === MAIN_VIEW_NAME && partition === "m") {
            return {
              viewName,
              viewVersion: "1",
              partition,
              lastCommittedId: committedEvents.length,
              value: pollutedMainCheckpoint,
            };
          }

          return undefined;
        },
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: committedEvents.length,
      historyStats: {
        committedCount: committedEvents.length,
        latestCommittedId: committedEvents.length,
        draftCount: 0,
        latestDraftClock: 0,
      },
      loadEvents: vi.fn(async () => structuredClone(committedEvents)),
      createInitialState: () => ({
        scenes: {
          items: {},
          tree: [],
        },
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    await expect(repository.setActiveSceneId(sceneId)).resolves.toBeUndefined();
    expect(
      repository.getState().scenes.items[sceneId].sections.items[sectionId]
        .lines.items[lineId],
    ).toMatchObject({
      id: lineId,
    });
  });

  it("flushes a stripped main checkpoint even when an active scene is loaded", async () => {
    const sceneId = "scene-1";
    const sectionId = "section-1";
    const lineId = "line-1";
    const fullRepositoryState = createSceneRepositoryState({
      sceneId,
      sectionId,
      lineId,
    });
    const mainCheckpointSaveCalls = [];
    const committedEvents = [
      createProjectCreateRepositoryEvent({
        projectId: "project-1",
        state: fullRepositoryState,
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
    const reduceEventToState = createSceneProjectionReducer();

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        listCommittedAfter,
        loadMaterializedViewCheckpoint: async ({ viewName, partition }) => {
          if (viewName === MAIN_VIEW_NAME && partition === "m") {
            return {
              viewName,
              viewVersion: "1",
              partition,
              lastCommittedId: committedEvents.length,
              value: createMainProjectionState(fullRepositoryState),
            };
          }

          return undefined;
        },
        saveMaterializedViewCheckpoint: async (checkpoint) => {
          if (
            checkpoint?.viewName === MAIN_VIEW_NAME &&
            checkpoint?.partition === "m"
          ) {
            mainCheckpointSaveCalls.push(structuredClone(checkpoint));
          }
        },
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: committedEvents.length,
      historyStats: {
        committedCount: committedEvents.length,
        latestCommittedId: committedEvents.length,
        draftCount: 0,
        latestDraftClock: 0,
      },
      loadEvents: vi.fn(async () => structuredClone(committedEvents)),
      createInitialState: () => ({
        scenes: {
          items: {},
          tree: [],
        },
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    await repository.setActiveSceneId(sceneId);
    await repository.flushMainCheckpoint();

    expect(mainCheckpointSaveCalls).not.toHaveLength(0);
    expect(
      mainCheckpointSaveCalls.at(-1)?.value?.scenes?.items?.[sceneId]?.sections
        ?.items?.[sectionId]?.lines?.items?.[lineId],
    ).toBeUndefined();
  });

  it("adopts main-scene section changes without replaying section.create twice", async () => {
    const sceneId = "scene-1";
    const sectionId = "section-1";
    const nextSectionId = "section-2";
    const initialState = createSceneRepositoryState({
      sceneId,
      sectionId,
    });
    const reduceEventToState = createSceneProjectionReducer();

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        loadMaterializedViewCheckpoint: async ({ viewName, partition }) => {
          if (viewName === MAIN_VIEW_NAME && partition === "m") {
            return {
              viewName,
              viewVersion: "1",
              partition,
              lastCommittedId: 1,
              value: createMainProjectionState(initialState),
            };
          }

          return undefined;
        },
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      events: [
        createProjectCreateRepositoryEvent({
          projectId: "project-1",
          state: initialState,
        }),
      ],
      createInitialState: () => ({
        scenes: {
          items: {},
          tree: [],
        },
      }),
      reduceEventToState,
      reduceEventsToState: createBatchedReducer(reduceEventToState),
    });

    await repository.setActiveSceneId(sceneId);
    await expect(
      repository.addEvent({
        id: "section-create-2",
        projectId: "project-1",
        type: "section.create",
        partition: mainScenePartitionFor(sceneId),
        payload: {
          sceneId,
          sectionId: nextSectionId,
          parentId: null,
          index: 1,
          data: {
            name: "Section 2",
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(
      repository.getState().scenes.items[sceneId].sections.items[nextSectionId],
    ).toMatchObject({
      id: nextSectionId,
      name: "Section 2",
    });
  });
});
