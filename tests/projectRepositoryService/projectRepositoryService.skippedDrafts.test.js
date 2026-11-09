import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";
import {
  applyRepositoryEventsToRepositoryState,
  createProjectCreateRepositoryEvent,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";
import { mainScenePartitionFor } from "../../src/deps/services/shared/collab/partitions.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
  createMainProjectionState,
} from "../../src/deps/services/shared/projectRepositoryViews/shared.js";

const projectId = "project-1";
const sceneId = "scene-1";

afterEach(() => {
  vi.restoreAllMocks();
});

const createDraft = ({ id, type, payload, clientTs }) => ({
  id,
  partition: mainScenePartitionFor(sceneId),
  projectId,
  userId: "user-1",
  type,
  schemaVersion: 1,
  payload,
  clientTs,
  createdAt: clientTs,
  meta: {},
});

const projectDrafts = [
  {
    ...createProjectCreateRepositoryEvent({
      projectId,
      state: initialProjectData,
      clientTs: 1,
    }),
    createdAt: 1,
  },
  createDraft({
    id: "scene-create",
    type: "scene.create",
    payload: { sceneId, data: { name: "Scene One" } },
    clientTs: 2,
  }),
];

// Applied when it was made, rejected now.
const leftOutDraft = createDraft({
  id: "scene-rename-left-out",
  type: "scene.update",
  payload: { sceneId, data: { name: "Scene Renamed" }, unsupportedField: true },
  clientTs: 3,
});

const historyStats = {
  committedCount: 0,
  latestCommittedId: 0,
  draftCount: 3,
  latestDraftClock: 3,
};

// The main checkpoint saved while the left-out draft still applied.
const createMainCheckpoint = ({
  checkpointHistoryStats = historyStats,
} = {}) => {
  const { repositoryState } = applyRepositoryEventsToRepositoryState({
    repositoryState: initialProjectData,
    events: projectDrafts,
    projectId,
  });
  repositoryState.scenes.items[sceneId].name = "Scene Renamed";
  return {
    viewName: MAIN_VIEW_NAME,
    partition: MAIN_PARTITION,
    viewVersion: MAIN_VIEW_VERSION,
    lastCommittedId:
      checkpointHistoryStats.committedCount + checkpointHistoryStats.draftCount,
    value: createMainProjectionState(repositoryState),
    meta: { historyStats: checkpointHistoryStats },
    updatedAt: 1,
  };
};

const createService = ({
  drafts = [...projectDrafts, leftOutDraft],
  storeHistoryStats = historyStats,
  invalidMain = false,
  operations = [],
  failUnfinishedRecord = false,
  getHistoryStats = () => storeHistoryStats,
} = {}) => {
  const checkpoints = new Map([
    [
      MAIN_VIEW_NAME,
      createMainCheckpoint({ checkpointHistoryStats: storeHistoryStats }),
    ],
  ]);
  if (invalidMain) {
    checkpoints.get(MAIN_VIEW_NAME).value.files.items.orphan = {
      id: "orphan",
      type: "folder",
      name: "Folder",
    };
  }
  const toKey = ({ viewName, partition }) =>
    viewName === MAIN_VIEW_NAME && partition === MAIN_PARTITION
      ? MAIN_VIEW_NAME
      : `${viewName}:${partition}`;
  const store = {
    listCommittedAfter: vi.fn(async () => []),
    listDraftsOrdered: vi.fn(async () => structuredClone(drafts)),
    getRepositoryHistoryStats: vi.fn(async () =>
      structuredClone(getHistoryStats()),
    ),
    isRepositoryHistoryStatsEqual: (left, right) =>
      JSON.stringify(left) === JSON.stringify(right),
    loadMaterializedViewCheckpoint: async (key) =>
      structuredClone(checkpoints.get(toKey(key))),
    loadMaterializedViewCheckpoints: async () => [],
    saveMaterializedViewCheckpoint: async (checkpoint) => {
      operations.push({
        action: "save",
        checkpoint: structuredClone(checkpoint),
      });
      if (
        failUnfinishedRecord &&
        checkpoint.viewName === "project_repository_skipped_drafts" &&
        !checkpoint.value.rebuilt
      ) {
        throw new Error("Could not save rebuild marker");
      }
      checkpoints.set(toKey(checkpoint), structuredClone(checkpoint));
    },
    deleteMaterializedViewCheckpoint: vi.fn(async (key) => {
      operations.push({ action: "delete", key: structuredClone(key) });
      checkpoints.delete(toKey(key));
    }),
    app: {
      get: vi.fn(async (key) => {
        if (key === "creatorVersion") {
          return 1;
        }
        if (key === "projectInfo") {
          return {
            id: projectId,
            namespace: "namespace-1",
            nativeApplicationIdentifier: "com.example.project-one",
            name: "Project One",
            description: "",
            iconFileId: null,
          };
        }
        return undefined;
      }),
      set: vi.fn(async () => {}),
    },
  };

  const service = createProjectRepositoryService({
    router: {
      getPayload: () => ({ p: projectId }),
    },
    db: {
      get: vi.fn(async () => [{ id: projectId, name: "Project One" }]),
      set: vi.fn(async () => {}),
    },
    creatorVersion: 1,
    storageAdapter: {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async () => ({
        cacheKey: projectId,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    },
    collabAdapter: {
      beforeCreateRepository: async () => undefined,
      afterCreateRepository: async () => undefined,
    },
  });

  return { service, store };
};

describe("projectRepositoryService left-out drafts", () => {
  it("preserves the old main checkpoint when the unfinished marker cannot be saved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const operations = [];
    const { service, store } = createService({
      invalidMain: true,
      operations,
      failUnfinishedRecord: true,
    });
    const original = JSON.stringify(
      await store.loadMaterializedViewCheckpoint({
        viewName: MAIN_VIEW_NAME,
        partition: MAIN_PARTITION,
      }),
    );
    await expect(service.ensureRepository()).rejects.toThrow(
      "missing item 'orphan'",
    );
    expect(
      JSON.stringify(
        await store.loadMaterializedViewCheckpoint({
          viewName: MAIN_VIEW_NAME,
          partition: MAIN_PARTITION,
        }),
      ),
    ).toBe(original);
    expect(
      operations.some(
        ({ checkpoint }) => checkpoint?.viewName === MAIN_VIEW_NAME,
      ),
    ).toBe(false);
  });

  it.each(["before commit", "after commit"])(
    "handles history changing %s during recovery",
    async (changeTime) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const operations = [];
      let statsReads = 0;
      const changedStats = { ...historyStats, latestDraftClock: 4 };
      const { service, store } = createService({
        invalidMain: true,
        operations,
        getHistoryStats: () => {
          statsReads += 1;
          const changeAt = changeTime === "before commit" ? 3 : 4;
          return statsReads >= changeAt ? changedStats : historyStats;
        },
      });
      const key = { viewName: MAIN_VIEW_NAME, partition: MAIN_PARTITION };
      const original = await store.loadMaterializedViewCheckpoint(key);
      if (changeTime === "before commit") {
        await expect(service.ensureRepository()).rejects.toThrow(
          "missing item 'orphan'",
        );
        expect(await store.loadMaterializedViewCheckpoint(key)).toEqual(
          original,
        );
        expect(
          operations.some(
            ({ checkpoint }) => checkpoint?.viewName === MAIN_VIEW_NAME,
          ),
        ).toBe(false);
        expect(
          operations.some(
            ({ checkpoint }) =>
              checkpoint?.viewName === "project_repository_skipped_drafts" &&
              checkpoint.value.rebuilt,
          ),
        ).toBe(false);
      } else {
        const repository = await service.ensureRepository();
        expect(repository.getState().scenes.items[sceneId].name).toBe(
          "Scene One",
        );
        expect(await store.loadMaterializedViewCheckpoint(key)).toBeUndefined();
        const mainOperations = operations.filter(
          ({ checkpoint, key: operationKey }) =>
            checkpoint?.viewName === MAIN_VIEW_NAME ||
            operationKey?.viewName === MAIN_VIEW_NAME,
        );
        expect(mainOperations.map(({ action }) => action)).toEqual([
          "save",
          "delete",
        ]);
        expect(warn).toHaveBeenCalledWith(
          "Discarding recovered project repository checkpoint after history changed",
        );
      }
    },
  );

  it("keeps the rebuild marker unfinished until recovered main state and scene caches are saved", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const operations = [];
    const { service } = createService({ invalidMain: true, operations });
    const repository = await service.ensureRepository();
    expect(repository.getState().scenes.items[sceneId].name).toBe("Scene One");
    const unfinished = operations.findIndex(
      ({ checkpoint }) =>
        checkpoint?.viewName === "project_repository_skipped_drafts" &&
        checkpoint.value.rebuilt === false,
    );
    const main = operations.findIndex(
      ({ checkpoint }) => checkpoint?.viewName === MAIN_VIEW_NAME,
    );
    const finished = operations.findIndex(
      ({ checkpoint }) =>
        checkpoint?.viewName === "project_repository_skipped_drafts" &&
        checkpoint.value.rebuilt === true,
    );
    const sceneClear = operations.findIndex(
      ({ action, key }) =>
        action === "delete" && key?.viewName !== MAIN_VIEW_NAME,
    );
    expect(unfinished).toBeGreaterThanOrEqual(0);
    expect(sceneClear).toBeGreaterThan(unfinished);
    expect(main).toBeGreaterThan(sceneClear);
    expect(finished).toBeGreaterThan(main);
  });

  it("passes the drafts a lazy history load leaves out to subscribers", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { service, store } = createService();

    expect(() => service.subscribeSkippedDrafts(vi.fn())).toThrow(
      "Repository not initialized",
    );

    const repository = await service.ensureRepository();
    const onSkippedDrafts = vi.fn();
    service.subscribeSkippedDrafts(onSkippedDrafts);

    expect(store.listDraftsOrdered).not.toHaveBeenCalled();
    expect(repository.getState().scenes.items[sceneId].name).toBe(
      "Scene Renamed",
    );
    expect(onSkippedDrafts).not.toHaveBeenCalled();

    const events = await repository.loadEvents();

    expect(events.map(({ id }) => id)).toEqual([
      "project-create:project-1",
      "scene-create",
    ]);
    expect(repository.getState().scenes.items[sceneId].name).toBe("Scene One");
    expect(onSkippedDrafts).toHaveBeenCalledOnce();
    expect(onSkippedDrafts.mock.calls[0][0]).toEqual([
      {
        draftId: "scene-rename-left-out",
        type: "scene.update",
        partition: mainScenePartitionFor(sceneId),
        sceneId,
        error: {
          code: "payload_validation_failed",
          message: "payload.unsupportedField is not allowed",
        },
      },
    ]);
  });

  it("keeps desktop history backed by a main checkpoint and reports nothing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    // No project.create: the scene exists only in the checkpoint, so the
    // rename cannot replay onto an empty project although it is not lost.
    const rename = createDraft({
      id: "scene-rename",
      type: "scene.update",
      payload: { sceneId, data: { name: "Scene Renamed" } },
      clientTs: 3,
    });
    const { service, store } = createService({
      drafts: [rename],
      storeHistoryStats: {
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      },
    });
    const repository = await service.ensureRepository();
    const onSkippedDrafts = vi.fn();
    service.subscribeSkippedDrafts(onSkippedDrafts);

    const events = await repository.loadEvents();

    expect(events).toEqual([]);
    expect(onSkippedDrafts).toHaveBeenCalledWith([], undefined);
    expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalled();
    expect(repository.getState().scenes.items[sceneId].name).toBe(
      "Scene Renamed",
    );
  });
});
