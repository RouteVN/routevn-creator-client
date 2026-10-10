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
} = {}) => {
  const checkpoints = new Map([
    [
      MAIN_VIEW_NAME,
      createMainCheckpoint({ checkpointHistoryStats: storeHistoryStats }),
    ],
  ]);
  const toKey = ({ viewName, partition }) =>
    viewName === MAIN_VIEW_NAME && partition === MAIN_PARTITION
      ? MAIN_VIEW_NAME
      : `${viewName}:${partition}`;
  const store = {
    listCommittedAfter: vi.fn(async () => []),
    listDraftsOrdered: vi.fn(async () => structuredClone(drafts)),
    getRepositoryHistoryStats: async () => structuredClone(storeHistoryStats),
    isRepositoryHistoryStatsEqual: (left, right) =>
      JSON.stringify(left) === JSON.stringify(right),
    loadMaterializedViewCheckpoint: async (key) =>
      structuredClone(checkpoints.get(toKey(key))),
    loadMaterializedViewCheckpoints: async () => [],
    saveMaterializedViewCheckpoint: async (checkpoint) => {
      checkpoints.set(toKey(checkpoint), structuredClone(checkpoint));
    },
    deleteMaterializedViewCheckpoint: vi.fn(async (key) => {
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
    expect(onSkippedDrafts).toHaveBeenCalledWith([
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
    expect(onSkippedDrafts).toHaveBeenCalledWith([]);
    expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalled();
    expect(repository.getState().scenes.items[sceneId].name).toBe(
      "Scene Renamed",
    );
  });
});
