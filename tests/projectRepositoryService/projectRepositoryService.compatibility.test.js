import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";

const createService = ({
  creatorVersion = 2,
  readCreatorVersionByReference = async () => undefined,
  storeCreatorVersion = creatorVersion,
  storeProjectionGap = undefined,
  storeOverrides = {},
} = {}) => {
  const collabAdapter = {
    beforeCreateRepository: vi.fn(async () => undefined),
    afterCreateRepository: vi.fn(async () => undefined),
  };
  const baseStore = {
    app: {
      get: vi.fn(async (key) =>
        key === "creatorVersion"
          ? storeCreatorVersion
          : key === "projectorGap"
            ? storeProjectionGap
            : undefined,
      ),
    },
  };
  const storageAdapter = {
    resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
      projectPath: `/tmp/${projectId}`,
      cacheKey: `/tmp/${projectId}`,
      repositoryProjectId: projectId,
    })),
    readCreatorVersionByReference: vi.fn(readCreatorVersionByReference),
    evictStoreByReference: vi.fn(async () => {}),
    createStore: vi.fn(async () => ({
      ...baseStore,
      ...storeOverrides,
      app: {
        ...baseStore.app,
        ...storeOverrides.app,
      },
    })),
  };

  const service = createProjectRepositoryService({
    router: {
      getPayload: () => ({}),
    },
    db: {},
    creatorVersion,
    storageAdapter,
    collabAdapter,
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

  it("rejects projects with a stored projection gap as incompatible", async () => {
    const { service, storageAdapter } = createService({
      creatorVersion: 2,
      storeProjectionGap: {
        commandType: "scene.update",
        remoteSchemaVersion: 3,
        supportedSchemaVersion: 2,
        message: "schemaVersion 3 is newer than supported 2",
      },
    });

    await expect(
      service.ensureProjectCompatibleByProjectId("project-1"),
    ).rejects.toMatchObject({
      code: "project_projection_gap_incompatible",
    });

    await expect(
      service.ensureProjectCompatibleByProjectId("project-1"),
    ).rejects.toThrow(
      "This project contains committed changes that this RouteVN Creator build cannot project safely.",
    );

    expect(storageAdapter.createStore).toHaveBeenCalledTimes(2);
  });

  it("normalizes unsupported project store layouts into a hard-cutover incompatibility error", async () => {
    const storeFormatError = new Error("bootstrap history unsupported");
    storeFormatError.code = "project_store_format_unsupported";

    const { service: failingService, storageAdapter } = createService();
    storageAdapter.createStore.mockRejectedValue(storeFormatError);

    await expect(
      failingService.ensureProjectCompatibleByProjectId("project-1"),
    ).rejects.toMatchObject({
      code: "project_store_format_unsupported",
      message:
        "Unsupported project store format. This RouteVN Creator build only supports the current project storage layout and will not repair older local stores automatically.",
    });
  });

  it("blocks repository open before event loading when a stored projection gap exists", async () => {
    const getEvents = vi.fn(async () => []);
    const { service } = createService({
      creatorVersion: 2,
      storeProjectionGap: {
        commandType: "scene.update",
        remoteSchemaVersion: 3,
        supportedSchemaVersion: 2,
      },
      storeOverrides: {
        getEvents,
      },
    });

    await expect(service.getRepositoryById("project-1")).rejects.toMatchObject({
      code: "project_projection_gap_incompatible",
    });
    expect(getEvents).not.toHaveBeenCalled();
  });
});
