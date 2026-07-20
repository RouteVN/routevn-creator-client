import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  commandApi: {
    getState: vi.fn(),
    deleteImages: vi.fn(),
    deleteSounds: vi.fn(),
    deleteVideos: vi.fn(),
  },
}));

vi.mock("../../src/deps/services/shared/commandApi.js", () => ({
  createCommandApi: vi.fn(() => mocked.commandApi),
}));

import { createProjectCollabCore } from "../../src/deps/services/shared/projectCollabCore.js";

const createVersionsCollabCore = (initialVersions = []) => {
  let storedVersions = structuredClone(initialVersions);
  const adapter = {
    app: {
      get: vi.fn(async () => structuredClone(storedVersions)),
      set: vi.fn(async (_key, versions) => {
        storedVersions = structuredClone(versions);
      }),
    },
  };
  const collabCore = createProjectCollabCore({
    router: {
      getPayload: () => ({ p: "project-1" }),
    },
    idGenerator: () => "generated-id",
    now: () => 0,
    collabLog: () => {},
    getCurrentRepository: async () => undefined,
    getCachedRepository: () => undefined,
    getRepositoryByProject: async () => undefined,
    getAdapterByProject: () => adapter,
    createSessionForProject: async () => undefined,
    createTransport: () => undefined,
    onEnsureLocalSession: () => {},
    onSessionCleared: () => {},
    onSessionTransportUpdated: () => {},
  });

  return { adapter, collabCore };
};

describe("createProjectCollabCore versions cache", () => {
  it("caches a cloned version list after its first storage load", async () => {
    const { collabCore } = createVersionsCollabCore([
      { id: "version-1", name: "Version One" },
    ]);

    expect(collabCore.getCachedVersions("project-1")).toBeUndefined();

    const versions = await collabCore.loadVersionsFromProject("project-1");
    versions[0].name = "Changed outside the cache";

    expect(collabCore.getCachedVersions("project-1")).toEqual([
      { id: "version-1", name: "Version One" },
    ]);
  });

  it("keeps the cache aligned with version mutations", async () => {
    const { collabCore } = createVersionsCollabCore([
      { id: "version-1", name: "Version One" },
    ]);

    await collabCore.addVersionToProject("project-1", {
      id: "version-2",
      name: "Version Two",
    });
    expect(collabCore.getCachedVersions("project-1")).toEqual([
      { id: "version-2", name: "Version Two" },
      { id: "version-1", name: "Version One" },
    ]);

    await collabCore.updateVersionInProject("project-1", "version-1", {
      name: "Version One Updated",
    });
    expect(collabCore.getCachedVersions("project-1")).toEqual([
      { id: "version-2", name: "Version Two" },
      { id: "version-1", name: "Version One Updated" },
    ]);

    await collabCore.deleteVersionFromProject("project-1", "version-2");
    expect(collabCore.getCachedVersions("project-1")).toEqual([
      { id: "version-1", name: "Version One Updated" },
    ]);
  });
});

describe("createProjectCollabCore deleteIfUnused", () => {
  beforeEach(() => {
    mocked.commandApi.getState.mockReset();
    mocked.commandApi.deleteImages.mockReset();
    mocked.commandApi.deleteSounds.mockReset();
    mocked.commandApi.deleteVideos.mockReset();
  });

  it("returns deleted false when the delete command fails validation", async () => {
    mocked.commandApi.getState.mockReturnValue({
      scenes: {},
      sections: {},
      lines: {},
      layouts: {},
      controls: {},
    });
    mocked.commandApi.deleteImages.mockResolvedValue({
      valid: false,
      error: {
        message: "cannot delete image",
      },
    });

    const collabCore = createProjectCollabCore({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: undefined,
      getCurrentRepository: async () => undefined,
      getCachedRepository: () => undefined,
      getRepositoryByProject: async () => undefined,
      getAdapterByProject: () => undefined,
      createSessionForProject: async () => undefined,
      createTransport: () => undefined,
      onEnsureLocalSession: () => {},
      onSessionCleared: () => {},
      onSessionTransportUpdated: () => {},
    });

    const result = await collabCore.deleteImageIfUnused({
      imageId: "image-1",
      checkTargets: ["scenes", "layouts"],
    });

    expect(result).toEqual({
      deleted: false,
      usage: {
        inProps: {},
        isUsed: false,
        count: 0,
      },
      deleteResult: {
        valid: false,
        error: {
          message: "cannot delete image",
        },
      },
    });
  });
});
