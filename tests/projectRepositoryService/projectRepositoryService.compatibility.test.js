import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";

const createService = ({
  creatorVersion = 2,
  readCreatorVersionByReference = undefined,
  storeCreatorVersion = creatorVersion,
} = {}) => {
  const storageAdapter = {
    resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
      projectPath: `/tmp/${projectId}`,
      cacheKey: `/tmp/${projectId}`,
      repositoryProjectId: projectId,
    })),
    createStore: vi.fn(async () => ({
      app: {
        get: vi.fn(async (key) =>
          key === "creatorVersion" ? storeCreatorVersion : undefined,
        ),
      },
    })),
  };
  if (typeof readCreatorVersionByReference === "function") {
    storageAdapter.readCreatorVersionByReference = vi.fn(
      readCreatorVersionByReference,
    );
  }

  const service = createProjectRepositoryService({
    router: {
      getPayload: () => ({}),
    },
    db: {},
    creatorVersion,
    storageAdapter,
    collabAdapter: {},
  });

  return {
    service,
    storageAdapter,
  };
};

describe("projectRepositoryService compatibility ordering", () => {
  it("checks creatorVersion before creating the client store when raw metadata is available", async () => {
    const { service, storageAdapter } = createService({
      creatorVersion: 2,
      readCreatorVersionByReference: async () => 1,
      storeCreatorVersion: 6,
    });

    await expect(
      service.ensureProjectCompatibleByProjectId("project-1"),
    ).rejects.toThrow(
      "You're trying to open an incompatible project with version 1 using RouteVN Creator project format 2.",
    );

    expect(storageAdapter.createStore).not.toHaveBeenCalled();
  });

  it("falls back to the store-backed creatorVersion check when raw metadata is unavailable", async () => {
    const { service, storageAdapter } = createService({
      creatorVersion: 2,
      readCreatorVersionByReference: async () => undefined,
      storeCreatorVersion: 1,
    });

    await expect(
      service.ensureProjectCompatibleByProjectId("project-1"),
    ).rejects.toThrow(
      "You're trying to open an incompatible project with version 1 using RouteVN Creator project format 2.",
    );

    expect(storageAdapter.createStore).toHaveBeenCalledTimes(1);
  });
});
