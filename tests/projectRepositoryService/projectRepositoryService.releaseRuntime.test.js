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

describe("projectRepositoryService release runtime", () => {
  it("closes the cached store before evicting a released project reference", async () => {
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
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () =>
        createDraftRowsFromRepositoryEvents(repositoryEvents),
      ),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => undefined,
      loadMaterializedViewCheckpoints: async () => [],
      loadMaterializedView: async () => undefined,
      evictMaterializedView: async () => {},
      invalidateMaterializedView: async () => {},
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
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
      close: vi.fn(async () => {}),
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
      evictStoreByReference: vi.fn(async () => {}),
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

    await service.ensureRepository();
    await service.releaseRepositoryByProjectId("project-1");

    expect(store.close).toHaveBeenCalledTimes(1);
    expect(storageAdapter.evictStoreByReference).toHaveBeenCalledWith({
      reference: expect.objectContaining({
        projectId: "project-1",
        cacheKey: "/tmp/project-1",
      }),
    });
    expect(store.close.mock.invocationCallOrder[0]).toBeLessThan(
      storageAdapter.evictStoreByReference.mock.invocationCallOrder[0],
    );
  });

  it("restores a path-selected duplicate-id project from route state", async () => {
    const repositoryEvents = [
      {
        id: "project-create:shared-project-id",
        partition: "m",
        projectId: "shared-project-id",
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
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () =>
        createDraftRowsFromRepositoryEvents(repositoryEvents),
      ),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => undefined,
      loadMaterializedViewCheckpoints: async () => [],
      loadMaterializedView: async () => undefined,
      evictMaterializedView: async () => {},
      invalidateMaterializedView: async () => {},
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          if (key === "projectInfo") {
            return {
              id: "shared-project-id",
              namespace: "namespace-1",
              nativeApplicationIdentifier: "app-1",
              name: "Project Two",
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
      resolveProjectReferenceByProjectId: vi.fn(),
      resolveProjectReferenceByPath: vi.fn(async ({ projectPath }) => ({
        projectPath,
        cacheKey: projectPath,
        repositoryProjectId: projectPath,
      })),
      createStore: vi.fn(async () => store),
      evictStoreByReference: vi.fn(async () => {}),
    };
    const db = {
      get: vi.fn(async () => [
        {
          id: "shared-project-id",
          projectPath: "/projects/project-one",
          name: "Project One",
        },
        {
          id: "shared-project-id",
          projectPath: "/projects/project-two",
          name: "Project Two",
        },
      ]),
      set: vi.fn(async () => {}),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "shared-project-id",
          lp: "/projects/project-two",
        }),
      },
      db,
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    await service.ensureRepository();

    expect(
      storageAdapter.resolveProjectReferenceByProjectId,
    ).not.toHaveBeenCalled();
    expect(storageAdapter.resolveProjectReferenceByPath).toHaveBeenCalledWith({
      projectPath: "/projects/project-two",
    });
    expect(service.getCachedReference()).toMatchObject({
      projectId: "shared-project-id",
      projectPath: "/projects/project-two",
      cacheKey: "/projects/project-two",
      repositoryProjectId: "shared-project-id",
    });
    expect(service.getEnsuredProjectPath()).toBe("/projects/project-two");
    expect(service.getProjectCacheKey("shared-project-id")).toBe(
      "/projects/project-two",
    );
  });

  it("does not fall back to the first duplicate-id entry for a stale path route", async () => {
    const storageAdapter = {
      resolveProjectReferenceByProjectId: vi.fn(),
      resolveProjectReferenceByPath: vi.fn(),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "shared-project-id",
          lp: "/projects/missing-project",
        }),
      },
      db: {
        get: vi.fn(async () => [
          {
            id: "shared-project-id",
            projectPath: "/projects/project-one",
          },
          {
            id: "shared-project-id",
            projectPath: "/projects/project-two",
          },
        ]),
      },
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    await expect(service.ensureRepository()).rejects.toThrow(
      "Selected local project path is not registered",
    );
    expect(
      storageAdapter.resolveProjectReferenceByProjectId,
    ).not.toHaveBeenCalled();
    expect(storageAdapter.resolveProjectReferenceByPath).not.toHaveBeenCalled();
  });
});
