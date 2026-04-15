import { describe, expect, it } from "vitest";
import {
  createProjectCreateRepositoryEvent,
  createRepositoryCommandEvent,
  repositoryEventToCommand,
} from "../../src/deps/services/shared/projectRepository.js";
import { rebuildRepositoryProjectionCache } from "../../src/deps/services/shared/collab/projectorCache.js";
import { scenePartitionFor } from "../../src/deps/services/shared/collab/partitions.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const projectId = "project-1";
const sceneId = "scene-1";
const sectionId = "section-1";
const lineId = "line-1";

const createProjectState = () => ({
  project: {
    resolution: {
      width: 1920,
      height: 1080,
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
});

const createLineUpdateEvent = () =>
  createRepositoryCommandEvent({
    command: {
      id: "line-update-1",
      projectId,
      partition: scenePartitionFor(sceneId),
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId,
        data: {
          resetStoryAtSection: {
            sectionId,
          },
        },
        replace: false,
      },
      actor: {
        userId: "user-1",
        clientId: "client-1",
      },
      clientTs: 1,
      schemaVersion: 1,
    },
  });

const createRepositoryStore = (events = []) => {
  const state = {
    events: structuredClone(events),
    appValues: new Map(),
  };

  return {
    app: {
      get: async (key) => state.appValues.get(key),
      set: async (key, value) => state.appValues.set(key, value),
      remove: async (key) => state.appValues.delete(key),
    },
    async getEvents() {
      return structuredClone(state.events);
    },
    async clearEvents() {
      state.events = [];
    },
    async clearMaterializedViewCheckpoints() {},
    async appendEvent(event) {
      state.events.push(structuredClone(event));
    },
  };
};

describe("projector cache rebuild", () => {
  it("preserves the local project.create seed when committed history lacks it", async () => {
    const projectCreateEvent = createProjectCreateRepositoryEvent({
      projectId,
      state: createProjectState(),
    });
    const lineUpdateEvent = createLineUpdateEvent();
    const repositoryStore = createRepositoryStore([projectCreateEvent]);
    const rawClientStore = {
      _debug: {
        getCommitted: async () => [
          {
            ...structuredClone(lineUpdateEvent),
            committedId: 1,
            serverTs: 1,
          },
        ],
      },
    };

    await rebuildRepositoryProjectionCache({
      repositoryStore,
      rawClientStore,
    });

    const rebuiltEvents = await repositoryStore.getEvents();
    expect(rebuiltEvents).toHaveLength(2);
    expect(
      rebuiltEvents.map((event) => repositoryEventToCommand(event)?.type),
    ).toEqual([
      COMMAND_TYPES.PROJECT_CREATE,
      COMMAND_TYPES.LINE_UPDATE_ACTIONS,
    ]);
  });
});
