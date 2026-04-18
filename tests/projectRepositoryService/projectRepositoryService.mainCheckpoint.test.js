import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";

const createDraftRowsFromRepositoryEvents = (events = []) =>
  events.map((event, index) => ({
    ...structuredClone(event),
    createdAt: Number(event?.clientTs) || index + 1,
  }));

const noopCollabAdapter = {
  beforeCreateRepository: async () => undefined,
  afterCreateRepository: async () => undefined,
};

describe("projectRepositoryService main checkpoint reuse", () => {
  it("skips full event loading when the persisted main checkpoint is current", async () => {
    const repositoryEvents = [
      {
        id: "project-create:project-1",
        partition: "m",
        projectId: "project-1",
        type: "project.create",
        schemaVersion: 1,
        payload: {
          state: structuredClone(initialProjectData),
        },
        clientTs: 1,
        meta: {
          clientTs: 1,
        },
      },
    ];
    const listDraftsOrdered = vi.fn(async () =>
      createDraftRowsFromRepositoryEvents(repositoryEvents),
    );
    const appGet = vi.fn(async (key) => {
      if (key === "creatorVersion") {
        return 1;
      }

      if (key === "projectInfo") {
        return {
          id: "project-1",
          namespace: "namespace-1",
          name: "Project 1",
          description: "",
          iconFileId: null,
        };
      }

      return undefined;
    });
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered,
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => ({
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 1,
        value: structuredClone(initialProjectData),
        meta: {
          historyStats: {
            committedCount: 0,
            latestCommittedId: 0,
            draftCount: 1,
            latestDraftClock: 1,
          },
        },
        updatedAt: 1,
      }),
      saveMaterializedViewCheckpoint: async () => {},
      deleteMaterializedViewCheckpoint: async () => {},
      app: {
        get: appGet,
        set: vi.fn(async () => {}),
      },
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    };
    const db = {
      get: vi.fn(async () => [
        {
          id: "project-1",
          name: "Project 1",
        },
      ]),
      set: vi.fn(async () => {}),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db,
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const repository = await service.ensureRepository();

    expect(listDraftsOrdered).not.toHaveBeenCalled();
    expect(repository.getState()).toEqual(initialProjectData);

    const events = await repository.loadEvents();

    expect(listDraftsOrdered).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it("backfills legacy checkpoint metadata and still skips full event loading", async () => {
    const saveMaterializedViewCheckpoint = vi.fn(async () => {});
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 1,
        latestCommittedId: 1,
        draftCount: 3087,
        latestDraftClock: 3088,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => ({
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 3088,
        value: structuredClone(initialProjectData),
        updatedAt: 1,
      }),
      saveMaterializedViewCheckpoint,
      deleteMaterializedViewCheckpoint: async () => {},
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          if (key === "projectInfo") {
            return {
              id: "project-1",
              namespace: "namespace-1",
              name: "Project 1",
              description: "",
              iconFileId: null,
            };
          }

          return undefined;
        },
        set: vi.fn(async () => {}),
      },
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const repository = await service.ensureRepository();

    expect(store.listDraftsOrdered).not.toHaveBeenCalled();
    expect(saveMaterializedViewCheckpoint).toHaveBeenCalledTimes(2);
    expect(saveMaterializedViewCheckpoint).toHaveBeenNthCalledWith(1, {
      viewName: "project_repository_main_state",
      partition: "m",
      viewVersion: "1",
      lastCommittedId: 3088,
      value: initialProjectData,
      updatedAt: 1,
    });
    expect(saveMaterializedViewCheckpoint).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        viewName: "project_repository_main_state",
        partition: "m",
        viewVersion: "1",
        lastCommittedId: 3088,
        value: initialProjectData,
      }),
    );
    expect(repository.getState()).toEqual(initialProjectData);
  });

  it("flushes a fresh main checkpoint after replaying events for a stale checkpoint", async () => {
    const repositoryEvents = [
      {
        id: "project-create:project-1",
        partition: "m",
        projectId: "project-1",
        type: "project.create",
        schemaVersion: 1,
        payload: {
          state: structuredClone(initialProjectData),
        },
        clientTs: 1,
        meta: {
          clientTs: 1,
        },
      },
    ];
    const listDraftsOrdered = vi.fn(async () =>
      createDraftRowsFromRepositoryEvents(repositoryEvents),
    );
    const saveMaterializedViewCheckpoint = vi.fn(async () => {});
    let checkpointDeleted = false;
    const deleteMaterializedViewCheckpoint = vi.fn(async () => {
      checkpointDeleted = true;
    });
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered,
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 2,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () =>
        checkpointDeleted
          ? undefined
          : {
              viewName: "project_repository_main_state",
              viewVersion: "1",
              partition: "m",
              lastCommittedId: 1,
              value: structuredClone(initialProjectData),
              meta: {
                historyStats: {
                  committedCount: 0,
                  latestCommittedId: 0,
                  draftCount: 0,
                  latestDraftClock: 0,
                },
              },
              updatedAt: 1,
            },
      saveMaterializedViewCheckpoint,
      deleteMaterializedViewCheckpoint,
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          if (key === "projectInfo") {
            return {
              id: "project-1",
              namespace: "namespace-1",
              name: "Project 1",
              description: "",
              iconFileId: null,
            };
          }

          return undefined;
        },
        set: vi.fn(async () => {}),
      },
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const repository = await service.ensureRepository();

    expect(listDraftsOrdered).toHaveBeenCalledTimes(1);
    expect(deleteMaterializedViewCheckpoint).toHaveBeenCalledWith({
      viewName: "project_repository_main_state",
      partition: "m",
    });
    expect(saveMaterializedViewCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        viewName: "project_repository_main_state",
        partition: "m",
        viewVersion: "1",
        lastCommittedId: 1,
      }),
    );
    expect(repository.getState()).toEqual(initialProjectData);
  });

  it("recovers from a stale closed-pool store by evicting and recreating it", async () => {
    const staleStore = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => {
        throw new Error("attempted to acquire a connection on a closed pool");
      },
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          return undefined;
        },
      },
    };
    const freshStore = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => ({
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 1,
        value: structuredClone(initialProjectData),
        meta: {
          historyStats: {
            committedCount: 0,
            latestCommittedId: 0,
            draftCount: 1,
            latestDraftClock: 1,
          },
        },
        updatedAt: 1,
      }),
      saveMaterializedViewCheckpoint: async () => {},
      deleteMaterializedViewCheckpoint: async () => {},
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          if (key === "projectInfo") {
            return {
              id: "project-1",
              namespace: "namespace-1",
              name: "Project 1",
              description: "",
              iconFileId: null,
            };
          }

          return undefined;
        },
        set: vi.fn(async () => {}),
      },
    };
    let createStoreCallCount = 0;
    const evictStoreByReference = vi.fn(async () => {});
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => {
        createStoreCallCount += 1;
        return createStoreCallCount === 1 ? staleStore : freshStore;
      }),
      evictStoreByReference,
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const repository = await service.ensureRepository();

    expect(evictStoreByReference).toHaveBeenCalledTimes(1);
    expect(storageAdapter.createStore.mock.calls.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(repository.getState()).toEqual(initialProjectData);
  });

  it("reads project info by path without creating a cached live store", async () => {
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      readProjectInfoByReference: vi.fn(async () => ({
        id: "project-1",
        namespace: "namespace-1",
        name: "Project 1",
        description: "Description",
        iconFileId: "icon-1",
      })),
      resolveProjectReferenceByPath: vi.fn(async ({ projectPath }) => ({
        projectPath,
        cacheKey: projectPath,
        repositoryProjectId: projectPath,
      })),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => {
        throw new Error("createStore should not be called");
      }),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({}),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const projectInfo = await service.getProjectInfoByPath("/tmp/project-1");

    expect(storageAdapter.readProjectInfoByReference).toHaveBeenCalledTimes(1);
    expect(storageAdapter.createStore).not.toHaveBeenCalled();
    expect(projectInfo).toEqual({
      id: "project-1",
      namespace: "namespace-1",
      name: "Project 1",
      description: "Description",
      iconFileId: "icon-1",
    });
  });
});
