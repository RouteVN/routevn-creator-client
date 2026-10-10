import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyRepositoryEventsToRepositoryState,
  createProjectCreateRepositoryEvent,
  createProjectRepository,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";
import { loadRepositoryEventsFromClientStore } from "../../src/deps/services/shared/collab/clientStoreHistory.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../../src/deps/services/shared/collab/partitions.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
  SCENE_OVERVIEW_VIEW_NAME,
  SCENE_VIEW_NAME,
  SCENE_VIEW_VERSION,
  createMainProjectionState,
  createSceneProjectionState,
} from "../../src/deps/services/shared/projectRepositoryViews/shared.js";

const projectId = "project-1";
const sceneId = "scene-1";
const sectionId = "section-1";

afterEach(() => {
  vi.restoreAllMocks();
});

const createEvent = ({ id, partition, type, payload, clientTs }) => ({
  id,
  partition,
  projectId,
  userId: "user-1",
  type,
  schemaVersion: 1,
  payload,
  clientTs,
  createdAt: clientTs,
  meta: {},
});

const createLine = ({ id, lineId, clientTs, isRejected = false }) => {
  const payload = {
    sectionId,
    lines: [{ lineId, data: { actions: {} } }],
    position: "last",
  };
  if (isRejected) {
    payload.unsupportedField = true;
  }

  return createEvent({
    id,
    partition: scenePartitionFor(sceneId),
    type: "line.create",
    payload,
    clientTs,
  });
};

// The project as stored: a scene with one section and one line.
const createProjectEvents = () => [
  {
    ...createProjectCreateRepositoryEvent({
      projectId,
      state: initialProjectData,
      clientTs: 1,
    }),
    createdAt: 1,
  },
  createEvent({
    id: "scene-create",
    partition: mainScenePartitionFor(sceneId),
    type: "scene.create",
    payload: { sceneId, data: { name: "Scene One" } },
    clientTs: 2,
  }),
  createEvent({
    id: "section-create",
    partition: mainScenePartitionFor(sceneId),
    type: "section.create",
    payload: { sceneId, sectionId, data: { name: "Section One" } },
    clientTs: 3,
  }),
  createLine({ id: "line-create", lineId: "line-1", clientTs: 4 }),
];

// Drafts that applied when they were made but are now rejected.
const createLeftOutDrafts = () => [
  createLine({
    id: "line-create-left-out",
    lineId: "line-2",
    clientTs: 5,
    isRejected: true,
  }),
  createEvent({
    id: "scene-rename-left-out",
    partition: mainScenePartitionFor(sceneId),
    type: "scene.update",
    payload: {
      sceneId,
      data: { name: "Scene Renamed" },
      unsupportedField: true,
    },
    clientTs: 6,
  }),
];

const toCommittedRows = (events) =>
  events.map((event, index) => ({
    ...structuredClone(event),
    committedId: index + 1,
    serverTs: index + 1,
  }));

const createStoredState = () =>
  applyRepositoryEventsToRepositoryState({
    repositoryState: initialProjectData,
    events: createProjectEvents(),
    projectId,
  }).repositoryState;

// The project state as it was while the left-out drafts still applied.
const createStateWithLeftOutDrafts = () => {
  const state = createStoredState();
  const scene = state.scenes.items[sceneId];
  scene.name = "Scene Renamed";
  const lines = scene.sections.items[sectionId].lines;
  lines.items["line-2"] = structuredClone(lines.items["line-1"]);
  lines.items["line-2"].id = "line-2";
  lines.tree.push({ id: "line-2" });
  return state;
};

const toCheckpointKey = ({ viewName, partition }) => `${viewName}:${partition}`;

// A client store whose checkpoints can be saved, read back and deleted.
const createClientStore = ({
  committed = [],
  drafts = [],
  checkpoints = [],
}) => {
  const checkpointsByKey = new Map(
    checkpoints.map((checkpoint) => [
      toCheckpointKey(checkpoint),
      structuredClone(checkpoint),
    ]),
  );

  return {
    checkpointsByKey,
    listCommittedAfter: vi.fn(async ({ sinceCommittedId = 0, limit } = {}) =>
      committed
        .filter((event) => event.committedId > sinceCommittedId)
        .slice(0, limit ?? committed.length)
        .map((event) => structuredClone(event)),
    ),
    listDraftsOrdered: vi.fn(async () => structuredClone(drafts)),
    loadMaterializedViewCheckpoint: vi.fn(async (key) =>
      structuredClone(checkpointsByKey.get(toCheckpointKey(key))),
    ),
    loadMaterializedViewCheckpoints: vi.fn(async ({ viewName, partitions }) =>
      partitions
        .map((partition) =>
          checkpointsByKey.get(toCheckpointKey({ viewName, partition })),
        )
        .filter(Boolean)
        .map((checkpoint) => structuredClone(checkpoint)),
    ),
    saveMaterializedViewCheckpoint: vi.fn(async (checkpoint) => {
      checkpointsByKey.set(
        toCheckpointKey(checkpoint),
        structuredClone(checkpoint),
      );
    }),
    deleteMaterializedViewCheckpoint: vi.fn(async (key) => {
      checkpointsByKey.delete(toCheckpointKey(key));
    }),
  };
};

const createMainCheckpoint = ({ state, lastCommittedId }) => ({
  viewName: MAIN_VIEW_NAME,
  partition: MAIN_PARTITION,
  viewVersion: MAIN_VIEW_VERSION,
  lastCommittedId,
  value: createMainProjectionState(state),
  updatedAt: 1,
});

const createSceneCheckpoint = ({ state, lastCommittedId }) => ({
  viewName: SCENE_VIEW_NAME,
  partition: scenePartitionFor(sceneId),
  viewVersion: SCENE_VIEW_VERSION,
  lastCommittedId,
  value: createSceneProjectionState(state, scenePartitionFor(sceneId)),
  updatedAt: 1,
});

const createSceneOverviewCheckpoint = () => ({
  viewName: SCENE_OVERVIEW_VIEW_NAME,
  partition: scenePartitionFor(sceneId),
  viewVersion: "1",
  lastCommittedId: 6,
  value: { sceneId },
  updatedAt: 1,
});

const createRepository = async ({ store, historyStats, initialRevision }) => {
  const loadEvents = vi.fn(async ({ onSkippedDraft } = {}) =>
    loadRepositoryEventsFromClientStore({ store, projectId, onSkippedDraft }),
  );
  const repository = await createProjectRepository({
    projectId,
    store,
    historyLoaded: false,
    initialRevision,
    historyStats,
    loadEvents,
  });
  return { repository, loadEvents };
};

const getLineIds = (repository) =>
  Object.keys(
    repository.getState().scenes.items[sceneId].sections.items[sectionId].lines
      .items,
  );

const draftHistoryStats = {
  committedCount: 0,
  latestCommittedId: 0,
  draftCount: 6,
  latestDraftClock: 6,
};

describe("projectRepositoryRuntime left-out drafts", () => {
  it("rebuilds a reused main checkpoint without the left-out drafts and reports them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const staleState = createStateWithLeftOutDrafts();
    const store = createClientStore({
      drafts: [...createProjectEvents(), ...createLeftOutDrafts()],
      checkpoints: [
        createMainCheckpoint({ state: staleState, lastCommittedId: 6 }),
        createSceneCheckpoint({ state: staleState, lastCommittedId: 5 }),
        createSceneOverviewCheckpoint(),
      ],
    });
    const { repository, loadEvents } = await createRepository({
      store,
      historyStats: draftHistoryStats,
      initialRevision: 6,
    });
    const onSkippedDrafts = vi.fn();
    const onStateChange = vi.fn();
    repository.subscribeSkippedDrafts(onSkippedDrafts);
    repository.subscribe(onStateChange, { emitCurrent: false });

    // Opening reuses the checkpoint without loading the history.
    expect(loadEvents).not.toHaveBeenCalled();
    expect(repository.getState().scenes.items[sceneId].name).toBe(
      "Scene Renamed",
    );
    expect(onSkippedDrafts).not.toHaveBeenCalled();

    await repository.loadEvents();

    expect(store.deleteMaterializedViewCheckpoint).toHaveBeenCalledWith({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });
    expect(repository.getState().scenes.items[sceneId].name).toBe("Scene One");
    // The rebuilt checkpoint is saved at once, at the revision that still
    // counts the left-out drafts at the end of the history.
    const mainCheckpoint = store.checkpointsByKey.get(
      toCheckpointKey({ viewName: MAIN_VIEW_NAME, partition: MAIN_PARTITION }),
    );
    expect(mainCheckpoint.lastCommittedId).toBe(6);
    expect(mainCheckpoint.value.scenes.items[sceneId].name).toBe("Scene One");
    expect(onStateChange).toHaveBeenCalledOnce();
    expect(
      onStateChange.mock.calls[0][0].repositoryState.scenes.items[sceneId].name,
    ).toBe("Scene One");
    expect(onSkippedDrafts).toHaveBeenCalledOnce();
    expect(onSkippedDrafts).toHaveBeenCalledWith([
      {
        draftId: "line-create-left-out",
        type: "line.create",
        partition: scenePartitionFor(sceneId),
        sceneId,
        sectionId,
        error: {
          code: "payload_validation_failed",
          message: "payload.unsupportedField is not allowed",
        },
      },
      {
        draftId: "scene-rename-left-out",
        type: "scene.update",
        partition: mainScenePartitionFor(sceneId),
        sceneId,
        sectionId: undefined,
        error: {
          code: "payload_validation_failed",
          message: "payload.unsupportedField is not allowed",
        },
      },
    ]);
    expect(
      store.checkpointsByKey.has(
        toCheckpointKey({
          viewName: SCENE_VIEW_NAME,
          partition: scenePartitionFor(sceneId),
        }),
      ),
    ).toBe(false);
    expect(
      store.checkpointsByKey.has(
        toCheckpointKey({
          viewName: SCENE_OVERVIEW_VIEW_NAME,
          partition: scenePartitionFor(sceneId),
        }),
      ),
    ).toBe(false);

    // A later subscriber receives the drafts at once, and a second load does
    // not rebuild again.
    const onLaterSkippedDrafts = vi.fn();
    repository.subscribeSkippedDrafts(onLaterSkippedDrafts);
    expect(onLaterSkippedDrafts).toHaveBeenCalledOnce();
    expect(onLaterSkippedDrafts.mock.calls[0][0]).toHaveLength(2);
    await repository.loadEvents();
    expect(loadEvents).toHaveBeenCalledOnce();
    expect(onSkippedDrafts).toHaveBeenCalledOnce();
  });

  it("loads an opened scene without a left-out draft kept in its checkpoint", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const staleState = createStateWithLeftOutDrafts();
    const store = createClientStore({
      drafts: [...createProjectEvents(), ...createLeftOutDrafts()],
      checkpoints: [
        createMainCheckpoint({ state: staleState, lastCommittedId: 6 }),
        createSceneCheckpoint({ state: staleState, lastCommittedId: 5 }),
      ],
    });
    const { repository } = await createRepository({
      store,
      historyStats: draftHistoryStats,
      initialRevision: 6,
    });

    await repository.setActiveSceneId(sceneId);

    expect(getLineIds(repository)).toEqual(["line-1"]);
    const sceneCheckpoint = store.checkpointsByKey.get(
      toCheckpointKey({
        viewName: SCENE_VIEW_NAME,
        partition: scenePartitionFor(sceneId),
      }),
    );
    expect(
      Object.keys(
        sceneCheckpoint.value.scenes.items[sceneId].sections.items[sectionId]
          .lines.items,
      ),
    ).toEqual(["line-1"]);
  });

  it("refreshes a scene that was open before the history loaded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const staleState = createStateWithLeftOutDrafts();
    const committed = toCommittedRows(createProjectEvents());
    const store = createClientStore({
      committed,
      // Added after the project opened, so the history did not count it.
      drafts: [createLeftOutDrafts()[0]],
      checkpoints: [
        createMainCheckpoint({
          state: createStoredState(),
          lastCommittedId: committed.length,
        }),
        createSceneCheckpoint({
          state: staleState,
          lastCommittedId: committed.length,
        }),
      ],
    });
    const { repository } = await createRepository({
      store,
      historyStats: {
        committedCount: committed.length,
        latestCommittedId: committed.length,
        draftCount: 0,
        latestDraftClock: 0,
      },
      initialRevision: committed.length,
    });
    await repository.setActiveSceneId(sceneId);
    expect(getLineIds(repository)).toEqual(["line-1", "line-2"]);
    const onStateChange = vi.fn();
    repository.subscribe(onStateChange, { emitCurrent: false });

    await repository.loadEvents();

    expect(getLineIds(repository)).toEqual(["line-1"]);
    expect(onStateChange).toHaveBeenCalledOnce();
    // A left-out line never reached the main state, so it is not rebuilt.
    expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalledWith({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });
  });

  it("applies an event once when storage already held it as its load rebuilt the main state", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const staleState = createStateWithLeftOutDrafts();
    const drafts = [...createProjectEvents(), createLeftOutDrafts()[1]];
    const store = createClientStore({
      drafts,
      checkpoints: [
        createMainCheckpoint({ state: staleState, lastCommittedId: 5 }),
      ],
    });
    const { repository } = await createRepository({
      store,
      historyStats: {
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 5,
        latestDraftClock: 5,
      },
      initialRevision: 5,
    });
    const sceneCreate = createEvent({
      id: "scene-create-2",
      partition: mainScenePartitionFor("scene-2"),
      type: "scene.create",
      payload: { sceneId: "scene-2", data: { name: "Scene Two" } },
      clientTs: 7,
    });
    // A command stores its draft before the repository adds its event.
    drafts.push(sceneCreate);

    await repository.addEvent(sceneCreate);

    expect(repository.getState().scenes.items[sceneId].name).toBe("Scene One");
    expect(repository.getState().scenes.items["scene-2"].name).toBe(
      "Scene Two",
    );
    expect(
      (await repository.loadEvents()).filter(
        ({ id }) => id === "scene-create-2",
      ),
    ).toHaveLength(1);
    expect(repository.getRevision()).toBe(6);

    // An event added afterwards is applied as usual.
    await repository.addEvent(
      createEvent({
        id: "scene-rename-2",
        partition: mainScenePartitionFor("scene-2"),
        type: "scene.update",
        payload: { sceneId: "scene-2", data: { name: "Scene Three" } },
        clientTs: 8,
      }),
    );
    expect(repository.getState().scenes.items["scene-2"].name).toBe(
      "Scene Three",
    );
  });

  it("builds a scene overview from the rebuilt main state", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const staleState = createStateWithLeftOutDrafts();
    const store = createClientStore({
      drafts: [...createProjectEvents(), ...createLeftOutDrafts()],
      checkpoints: [
        createMainCheckpoint({ state: staleState, lastCommittedId: 6 }),
      ],
    });
    const { repository, loadEvents } = await createRepository({
      store,
      historyStats: draftHistoryStats,
      initialRevision: 6,
    });

    // Building the overview loads the scene, which loads the history.
    const overviews = await repository.loadSceneOverviews({
      sceneIds: [sceneId],
    });

    expect(loadEvents).toHaveBeenCalledOnce();
    expect(overviews[sceneId].name).toBe("Scene One");
  });

  it("does not rebuild again when a listener of left-out drafts throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = createClientStore({
      drafts: [...createProjectEvents(), ...createLeftOutDrafts()],
      checkpoints: [
        createMainCheckpoint({
          state: createStateWithLeftOutDrafts(),
          lastCommittedId: 6,
        }),
      ],
    });
    const { repository } = await createRepository({
      store,
      historyStats: draftHistoryStats,
      initialRevision: 6,
    });
    repository.subscribeSkippedDrafts(() => {
      throw new Error("Listener failed");
    });

    await expect(repository.loadEvents()).rejects.toThrow("Listener failed");
    await expect(repository.loadEvents()).resolves.toHaveLength(4);
    await repository.flushMainCheckpoint();

    expect(
      store.deleteMaterializedViewCheckpoint.mock.calls.filter(
        ([{ viewName }]) => viewName === MAIN_VIEW_NAME,
      ),
    ).toHaveLength(1);
    expect(repository.getState().scenes.items[sceneId].name).toBe("Scene One");
  });

  it("reports an empty list and keeps the main state when nothing is left out", async () => {
    const store = createClientStore({
      drafts: createProjectEvents(),
      checkpoints: [
        createMainCheckpoint({
          state: createStoredState(),
          lastCommittedId: 4,
        }),
      ],
    });
    const { repository } = await createRepository({
      store,
      historyStats: {
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 4,
        latestDraftClock: 4,
      },
      initialRevision: 4,
    });
    const onSkippedDrafts = vi.fn();
    repository.subscribeSkippedDrafts(onSkippedDrafts);

    await repository.loadEvents();

    expect(onSkippedDrafts).toHaveBeenCalledWith([]);
    expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalled();
  });

  it("rebuilds before the repository opens when building it loaded the history", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const staleState = createStateWithLeftOutDrafts();
    const store = createClientStore({
      drafts: [...createProjectEvents(), ...createLeftOutDrafts()],
      // The checkpoint is behind the history, so opening replays from it.
      checkpoints: [
        createMainCheckpoint({ state: staleState, lastCommittedId: 5 }),
      ],
    });
    const { repository, loadEvents } = await createRepository({
      store,
      historyStats: draftHistoryStats,
      initialRevision: 6,
    });

    expect(loadEvents).toHaveBeenCalledOnce();
    expect(repository.getState().scenes.items[sceneId].name).toBe("Scene One");
    const onSkippedDrafts = vi.fn();
    repository.subscribeSkippedDrafts(onSkippedDrafts);
    expect(
      onSkippedDrafts.mock.calls[0][0].map(({ draftId }) => draftId),
    ).toEqual(["line-create-left-out", "scene-rename-left-out"]);
  });
});
