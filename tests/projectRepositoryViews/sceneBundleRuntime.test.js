import { describe, expect, it, vi } from "vitest";
import { createRepositoryCommandEvent } from "../../src/deps/services/shared/projectRepository.js";
import {
  mainPartitionFor,
  scenePartitionFor,
} from "../../src/deps/services/shared/collab/partitions.js";
import { createSceneBundleRuntime } from "../../src/deps/services/shared/projectRepositoryViews/sceneBundleRuntime.js";
import {
  getLatestSceneOverviewRevision,
  OVERVIEW_CHECKPOINT_DEBOUNCE_MS,
  SCENE_OVERVIEW_VIEW_NAME,
  SCENE_OVERVIEW_VIEW_VERSION,
} from "../../src/deps/services/shared/projectRepositoryViews/shared.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const projectId = "project-1";
const activeSceneId = "scene-1";
const inactiveSceneId = "scene-2";
const mainPartition = mainPartitionFor();

const createScene = (sceneId, sectionId, lineId) => ({
  id: sceneId,
  type: "scene",
  name: `Scene ${sceneId}`,
  position: { x: 0, y: 0 },
  sections: {
    items: {
      [sectionId]: {
        id: sectionId,
        type: "section",
        name: `Section ${sectionId}`,
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
});

const createMainState = () => ({
  story: {
    initialSceneId: activeSceneId,
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
      [activeSceneId]: createScene(activeSceneId, "section-1", "line-1"),
      [inactiveSceneId]: createScene(inactiveSceneId, "section-2", "line-2"),
    },
    tree: [{ id: activeSceneId }, { id: inactiveSceneId }],
  },
});

const createSceneState = (sceneId) => ({
  scenes: {
    items: {
      [sceneId]: structuredClone(createMainState().scenes.items[sceneId]),
    },
  },
});

const createEvent = ({ type, payload }) =>
  createRepositoryCommandEvent({
    command: {
      id: `${type}-1`,
      projectId,
      partition: mainPartition,
      type,
      payload,
      actor: {
        userId: "user-1",
        clientId: "client-1",
      },
      clientTs: 1,
      schemaVersion: 1,
    },
  });

const createRuntime = ({ events }) => {
  const store = {
    deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
    saveMaterializedViewCheckpoint: vi.fn(async () => {}),
    loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
  };
  const mainState = createMainState();
  const listCommittedAfter = vi.fn(
    async ({ sinceCommittedId = 0, limit } = {}) => {
      const startIndex = Math.max(0, Number(sinceCommittedId) || 0);
      const normalizedLimit =
        Number.isInteger(limit) && limit > 0 ? limit : events.length;
      return events
        .slice(startIndex, startIndex + normalizedLimit)
        .map((event) => structuredClone(event));
    },
  );

  const runtime = createSceneBundleRuntime({
    store,
    listCommittedAfter,
    getCurrentMainState: () => mainState,
    getActiveSceneId: () => activeSceneId,
    getActiveSceneState: () => createSceneState(activeSceneId),
    loadSceneProjection: vi.fn(async (sceneId) => createSceneState(sceneId)),
  });

  return {
    runtime,
    store,
  };
};

describe("sceneBundleRuntime", () => {
  it("returns active scene overviews before checkpoint persistence runs", async () => {
    vi.useFakeTimers();

    try {
      const { runtime, store } = createRuntime({
        events: [],
      });

      const overview = await runtime.ensureSceneBundle(activeSceneId);

      expect(overview).toBeTruthy();
      expect(store.saveMaterializedViewCheckpoint).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(OVERVIEW_CHECKPOINT_DEBOUNCE_MS);

      expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledTimes(1);
      expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledWith({
        viewName: SCENE_OVERVIEW_VIEW_NAME,
        partition: scenePartitionFor(activeSceneId),
        viewVersion: SCENE_OVERVIEW_VIEW_VERSION,
        lastCommittedId: 0,
        value: expect.any(Object),
        updatedAt: expect.any(Number),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not invalidate scene overview checkpoints for image commands on the main partition", async () => {
    const imageEvent = createEvent({
      type: COMMAND_TYPES.IMAGE_CREATE,
      payload: {
        imageId: "image-1",
        data: {
          fileId: "file-1",
        },
      },
    });
    const { runtime, store } = createRuntime({
      events: [imageEvent],
    });

    await runtime.handleCommittedEvents([imageEvent]);

    expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalled();
    expect(store.saveMaterializedViewCheckpoint).not.toHaveBeenCalled();
  });

  it("invalidates inactive scene overviews for layout commands on the main partition", async () => {
    vi.useFakeTimers();

    try {
      const layoutEvent = createEvent({
        type: COMMAND_TYPES.LAYOUT_UPDATE,
        payload: {
          layoutId: "layout-1",
          data: {
            name: "Updated Layout",
          },
        },
      });
      const { runtime, store } = createRuntime({
        events: [layoutEvent],
      });

      await runtime.handleCommittedEvents([layoutEvent]);

      expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalled();
      expect(store.saveMaterializedViewCheckpoint).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(OVERVIEW_CHECKPOINT_DEBOUNCE_MS);

      expect(store.deleteMaterializedViewCheckpoint).toHaveBeenCalledTimes(1);
      expect(store.deleteMaterializedViewCheckpoint).toHaveBeenCalledWith({
        viewName: SCENE_OVERVIEW_VIEW_NAME,
        partition: scenePartitionFor(inactiveSceneId),
      });
      expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores unrelated main events when calculating scene overview freshness", () => {
    const imageEvent = createEvent({
      type: COMMAND_TYPES.IMAGE_CREATE,
      payload: {
        imageId: "image-1",
        data: {
          fileId: "file-1",
        },
      },
    });
    const layoutEvent = createEvent({
      type: COMMAND_TYPES.LAYOUT_UPDATE,
      payload: {
        layoutId: "layout-1",
        data: {
          name: "Updated Layout",
        },
      },
    });

    expect(
      getLatestSceneOverviewRevision({
        events: [imageEvent],
        sceneId: activeSceneId,
      }),
    ).toBe(0);
    expect(
      getLatestSceneOverviewRevision({
        events: [imageEvent, layoutEvent],
        sceneId: activeSceneId,
      }),
    ).toBe(2);
  });
});
