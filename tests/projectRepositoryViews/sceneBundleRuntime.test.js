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
  SCENE_TEXT_STATS_VIEW_NAME,
  SCENE_TEXT_STATS_VIEW_VERSION,
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

const createEvent = ({ type, payload, partition = mainPartition }) =>
  createRepositoryCommandEvent({
    command: {
      id: `${type}-1`,
      projectId,
      partition,
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

const createRuntime = ({
  events,
  checkpoints = {},
  textStatsCheckpoints = {},
  historyStats,
}) => {
  const store = {
    deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
    saveMaterializedViewCheckpoint: vi.fn(async () => {}),
    loadMaterializedViewCheckpoint: vi.fn(
      async ({ partition }) => checkpoints[partition],
    ),
    loadMaterializedViewCheckpoints: vi.fn(async ({ viewName, partitions }) => {
      const sourceCheckpoints =
        viewName === SCENE_TEXT_STATS_VIEW_NAME
          ? textStatsCheckpoints
          : checkpoints;
      return partitions
        .map((partition) => sourceCheckpoints[partition])
        .filter(Boolean)
        .map((checkpoint) => structuredClone(checkpoint));
    }),
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
  const loadSceneProjection = vi.fn(async (sceneId) =>
    createSceneState(sceneId),
  );

  const runtime = createSceneBundleRuntime({
    store,
    listCommittedAfter,
    getCurrentMainState: () => mainState,
    getCurrentRevision: () => events.length,
    getCurrentHistoryStats: () => historyStats,
    getActiveSceneId: () => activeSceneId,
    getActiveSceneState: () => createSceneState(activeSceneId),
    loadSceneProjection,
  });

  return {
    runtime,
    store,
    listCommittedAfter,
    loadSceneProjection,
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

  it("persists editor-calculated text stats separately from scene overviews", async () => {
    const { runtime, store } = createRuntime({ events: [] });
    const textStats = {
      lineCount: 3,
      wordCount: 12,
      characterCount: 48,
      language: "en",
    };

    await expect(
      runtime.cacheSceneTextStats({
        sceneId: activeSceneId,
        textStats,
      }),
    ).resolves.toEqual(textStats);

    expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledTimes(1);
    expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledWith({
      viewName: SCENE_TEXT_STATS_VIEW_NAME,
      partition: scenePartitionFor(activeSceneId),
      viewVersion: SCENE_TEXT_STATS_VIEW_VERSION,
      lastCommittedId: 0,
      value: textStats,
      updatedAt: expect.any(Number),
    });
  });

  it("loads cached text stats without loading a scene projection", async () => {
    const textStats = {
      lineCount: 3,
      wordCount: 12,
      characterCount: 48,
      language: "en",
    };
    const partition = scenePartitionFor(inactiveSceneId);
    const { runtime, loadSceneProjection } = createRuntime({
      events: [],
      textStatsCheckpoints: {
        [partition]: {
          partition,
          viewVersion: SCENE_TEXT_STATS_VIEW_VERSION,
          lastCommittedId: 0,
          value: textStats,
        },
      },
    });

    await expect(
      runtime.loadSceneTextStats({ sceneIds: [inactiveSceneId] }),
    ).resolves.toEqual({
      [inactiveSceneId]: textStats,
    });
    expect(loadSceneProjection).not.toHaveBeenCalled();
  });

  it("does not scan scene history when no text stats are cached", async () => {
    const { runtime, listCommittedAfter } = createRuntime({
      events: [
        createEvent({
          type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
          payload: { lineIds: ["line-2"], data: {} },
          partition: scenePartitionFor(inactiveSceneId),
        }),
      ],
    });

    await expect(
      runtime.loadSceneTextStats({ sceneIds: [inactiveSceneId] }),
    ).resolves.toEqual({});
    expect(listCommittedAfter).not.toHaveBeenCalled();
  });

  it("rejects cached text stats after a later text-changing event", async () => {
    const partition = scenePartitionFor(inactiveSceneId);
    const textEvent = createEvent({
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineIds: ["line-2"],
        data: {
          dialogue: {
            content: [{ text: "Updated text" }],
          },
        },
      },
      partition,
    });
    const { runtime, store } = createRuntime({
      events: [textEvent],
      textStatsCheckpoints: {
        [partition]: {
          partition,
          viewVersion: SCENE_TEXT_STATS_VIEW_VERSION,
          lastCommittedId: 0,
          value: {
            lineCount: 1,
            wordCount: 2,
            characterCount: 11,
            language: "en",
          },
        },
      },
    });

    await expect(
      runtime.loadSceneTextStats({ sceneIds: [inactiveSceneId] }),
    ).resolves.toEqual({});
    expect(store.deleteMaterializedViewCheckpoint).toHaveBeenCalledWith({
      viewName: SCENE_TEXT_STATS_VIEW_NAME,
      partition,
    });
  });

  it("keeps cached text stats after unrelated history advances", async () => {
    const partition = scenePartitionFor(inactiveSceneId);
    const textStats = {
      lineCount: 1,
      wordCount: 2,
      characterCount: 11,
      language: "en",
    };
    const { runtime, store } = createRuntime({
      events: [
        createEvent({
          type: COMMAND_TYPES.IMAGE_CREATE,
          payload: { imageId: "image-1" },
        }),
      ],
      textStatsCheckpoints: {
        [partition]: {
          partition,
          viewVersion: SCENE_TEXT_STATS_VIEW_VERSION,
          lastCommittedId: 0,
          value: textStats,
        },
      },
    });

    await expect(
      runtime.loadSceneTextStats({ sceneIds: [inactiveSceneId] }),
    ).resolves.toEqual({
      [inactiveSceneId]: textStats,
    });
    expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalled();
  });

  it("rejects cached text stats after history is replaced", async () => {
    const partition = scenePartitionFor(inactiveSceneId);
    const { runtime, store } = createRuntime({
      events: [],
      textStatsCheckpoints: {
        [partition]: {
          partition,
          viewVersion: SCENE_TEXT_STATS_VIEW_VERSION,
          lastCommittedId: 0,
          value: {
            lineCount: 1,
            wordCount: 2,
            characterCount: 11,
            language: "en",
          },
          meta: {
            historyStats: {
              committedCount: 0,
              latestCommittedId: 0,
              draftCount: 1,
              latestDraftClock: 1,
            },
          },
        },
      },
      historyStats: {
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 2,
      },
    });

    await expect(
      runtime.loadSceneTextStats({ sceneIds: [inactiveSceneId] }),
    ).resolves.toEqual({});
    expect(store.deleteMaterializedViewCheckpoint).toHaveBeenCalledWith({
      viewName: SCENE_TEXT_STATS_VIEW_NAME,
      partition,
    });
  });

  it("ignores cached text stats without a line count", async () => {
    const partition = scenePartitionFor(inactiveSceneId);
    const { runtime } = createRuntime({
      events: [],
      textStatsCheckpoints: {
        [partition]: {
          partition,
          viewVersion: "2",
          lastCommittedId: 0,
          value: {
            wordCount: 12,
            characterCount: 48,
            language: "en",
          },
        },
      },
    });

    await expect(
      runtime.loadSceneTextStats({ sceneIds: [inactiveSceneId] }),
    ).resolves.toEqual({});
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
      expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalledWith({
        viewName: SCENE_TEXT_STATS_VIEW_NAME,
        partition: scenePartitionFor(inactiveSceneId),
      });
      expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalidates cached text stats when scene text changes", async () => {
    const lineEvent = createEvent({
      partition: scenePartitionFor(activeSceneId),
      type: COMMAND_TYPES.LINE_UPDATE_ACTIONS,
      payload: {
        lineId: "line-1",
        data: {
          dialogue: {
            content: [{ text: "Updated text" }],
          },
        },
      },
    });
    const { runtime, store } = createRuntime({ events: [lineEvent] });

    await runtime.handleCommittedEvents([lineEvent]);

    expect(store.deleteMaterializedViewCheckpoint).toHaveBeenCalledWith({
      viewName: SCENE_TEXT_STATS_VIEW_NAME,
      partition: scenePartitionFor(activeSceneId),
    });
    await runtime.flushSceneOverviews();
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

  it("checks fresh overviews using full events after the checkpoint revision", async () => {
    const events = [
      createEvent({
        type: COMMAND_TYPES.IMAGE_CREATE,
        payload: { imageId: "image-1" },
      }),
      createEvent({
        type: COMMAND_TYPES.LAYOUT_UPDATE,
        payload: { layoutId: "layout-1" },
      }),
      createEvent({
        type: COMMAND_TYPES.IMAGE_CREATE,
        payload: { imageId: "image-2" },
      }),
      createEvent({
        type: COMMAND_TYPES.IMAGE_CREATE,
        payload: { imageId: "image-3" },
      }),
    ];
    const checkpointOverview = {
      sceneId: inactiveSceneId,
      name: "Checkpoint Scene",
      position: { x: 0, y: 0 },
      outgoingSceneIds: [],
      sections: [],
    };
    const checkpointPartition = scenePartitionFor(inactiveSceneId);
    const { runtime, listCommittedAfter } = createRuntime({
      events,
      checkpoints: {
        [checkpointPartition]: {
          partition: checkpointPartition,
          viewVersion: SCENE_OVERVIEW_VIEW_VERSION,
          lastCommittedId: 2,
          value: checkpointOverview,
        },
      },
    });

    const overviews = await runtime.loadSceneOverviews({
      sceneIds: [inactiveSceneId],
    });

    expect(overviews[inactiveSceneId]).toEqual(checkpointOverview);
    expect(
      listCommittedAfter.mock.calls.map(([call]) => call.sinceCommittedId),
    ).toEqual([2, 4]);
  });

  it("rebuilds a checkpoint when draft history changes at the same revision", async () => {
    const events = [
      createEvent({
        type: COMMAND_TYPES.IMAGE_CREATE,
        payload: { imageId: "image-1" },
      }),
      createEvent({
        type: COMMAND_TYPES.IMAGE_CREATE,
        payload: { imageId: "replacement-draft" },
      }),
    ];
    const checkpointPartition = scenePartitionFor(inactiveSceneId);
    const checkpointOverview = {
      sceneId: inactiveSceneId,
      name: "Stale Draft Scene",
      position: { x: 0, y: 0 },
      outgoingSceneIds: [activeSceneId],
      sections: [],
    };
    const { runtime, loadSceneProjection } = createRuntime({
      events,
      checkpoints: {
        [checkpointPartition]: {
          partition: checkpointPartition,
          viewVersion: SCENE_OVERVIEW_VIEW_VERSION,
          lastCommittedId: 2,
          value: checkpointOverview,
          meta: {
            historyStats: {
              committedCount: 1,
              latestCommittedId: 1,
              draftCount: 1,
              latestDraftClock: 1,
            },
          },
        },
      },
      historyStats: {
        committedCount: 1,
        latestCommittedId: 1,
        draftCount: 1,
        latestDraftClock: 2,
      },
    });

    const overviews = await runtime.loadSceneOverviews({
      sceneIds: [inactiveSceneId],
    });

    expect(loadSceneProjection).toHaveBeenCalledWith(inactiveSceneId);
    expect(overviews[inactiveSceneId]).not.toEqual(checkpointOverview);
  });
});
