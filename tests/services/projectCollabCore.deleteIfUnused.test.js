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

import { createCommandApi } from "../../src/deps/services/shared/commandApi.js";
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

  it("isolates same-id local version caches by project path", async () => {
    let currentProjectPath = "/projects/project-one";
    const versionsByPath = {
      "/projects/project-one": [
        { id: "version-1", name: "Project One Version" },
      ],
      "/projects/project-two": [
        { id: "version-2", name: "Project Two Version" },
      ],
    };
    const collabCore = createProjectCollabCore({
      router: {
        getPayload: () => ({ p: "shared-project-id" }),
      },
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      getCurrentRepository: async () => undefined,
      getCachedRepository: () => undefined,
      getRepositoryByProject: async () => undefined,
      getAdapterByProject: () => ({
        app: {
          get: vi.fn(async () =>
            structuredClone(versionsByPath[currentProjectPath]),
          ),
        },
      }),
      getProjectCacheKey: () => currentProjectPath,
      createSessionForProject: async () => undefined,
      createTransport: () => undefined,
      onEnsureLocalSession: () => {},
      onSessionCleared: () => {},
      onSessionTransportUpdated: () => {},
    });

    await collabCore.loadVersionsFromProject("shared-project-id");
    expect(collabCore.getCachedVersions("shared-project-id")).toEqual([
      { id: "version-1", name: "Project One Version" },
    ]);

    currentProjectPath = "/projects/project-two";

    expect(collabCore.getCachedVersions("shared-project-id")).toBeUndefined();
    await collabCore.loadVersionsFromProject("shared-project-id");
    expect(collabCore.getCachedVersions("shared-project-id")).toEqual([
      { id: "version-2", name: "Project Two Version" },
    ]);
  });
});

const createDeleteCollabCore = () =>
  createProjectCollabCore({
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

// The state the usage check reads, and the state that says which items exist.
const createProjectState = () => ({
  scenes: {},
  sections: {},
  lines: {},
  layouts: {},
  controls: {},
  images: { items: { "image-1": { id: "image-1" } } },
  sounds: { items: { "sound-1": { id: "sound-1" } } },
  videos: { items: { "video-1": { id: "video-1" } } },
});

const RESOURCES = [
  {
    name: "image",
    itemId: "image-1",
    idField: "imageId",
    collection: "images",
    deleteIfUnused: "deleteImageIfUnused",
    commandMethod: "deleteImages",
  },
  {
    name: "sound",
    itemId: "sound-1",
    idField: "soundId",
    collection: "sounds",
    deleteIfUnused: "deleteSoundIfUnused",
    commandMethod: "deleteSounds",
  },
  {
    name: "video",
    itemId: "video-1",
    idField: "videoId",
    collection: "videos",
    deleteIfUnused: "deleteVideoIfUnused",
    commandMethod: "deleteVideos",
  },
];

const NOT_USED = {
  inProps: {},
  isUsed: false,
  count: 0,
};

describe("createProjectCollabCore deleteIfUnused", () => {
  beforeEach(() => {
    mocked.commandApi.getState.mockReset();
    mocked.commandApi.deleteImages.mockReset();
    mocked.commandApi.deleteSounds.mockReset();
    mocked.commandApi.deleteVideos.mockReset();
  });

  it("returns deleted false when the delete command fails validation", async () => {
    mocked.commandApi.getState.mockReturnValue(createProjectState());
    mocked.commandApi.deleteImages.mockResolvedValue({
      valid: false,
      error: {
        message: "cannot delete image",
      },
    });

    const collabCore = createDeleteCollabCore();

    const result = await collabCore.deleteImageIfUnused({
      imageId: "image-1",
      checkTargets: ["scenes", "layouts"],
    });

    expect(result).toEqual({
      deleted: false,
      usage: NOT_USED,
      deleteResult: {
        valid: false,
        error: {
          message: "cannot delete image",
        },
      },
    });
  });

  it.each(RESOURCES)(
    "treats a $name that is already gone as deleted",
    async ({ itemId, idField, deleteIfUnused, commandMethod }) => {
      const state = createProjectState();
      state.images.items = {};
      state.sounds.items = {};
      state.videos.items = {};
      mocked.commandApi.getState.mockReturnValue(state);

      const collabCore = createDeleteCollabCore();

      const result = await collabCore[deleteIfUnused]({ [idField]: itemId });

      expect(result).toEqual({ deleted: true, usage: NOT_USED });
      expect(mocked.commandApi[commandMethod]).not.toHaveBeenCalled();
    },
  );

  it.each(RESOURCES)(
    "treats a $name delete refused because the item was just deleted as deleted",
    async ({ itemId, idField, collection, deleteIfUnused, commandMethod }) => {
      const state = createProjectState();
      mocked.commandApi.getState.mockReturnValue(state);
      const refused = {
        valid: false,
        error: { message: "payload must reference existing items" },
      };
      // The delete made before this one removes the item while this one waits.
      mocked.commandApi[commandMethod].mockImplementation(async () => {
        delete state[collection].items[itemId];
        return refused;
      });

      const collabCore = createDeleteCollabCore();

      const result = await collabCore[deleteIfUnused]({ [idField]: itemId });

      expect(result).toEqual({
        deleted: true,
        usage: NOT_USED,
        deleteResult: refused,
      });
    },
  );
});

describe("createProjectCollabCore commands", () => {
  it("are made in the open project, not the one the route names", () => {
    const openRepository = { projectId: "project-1" };
    createProjectCollabCore({
      router: { getPayload: () => ({}) },
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      getOpenProjectId: () => "project-1",
      getOpenRepository: () => openRepository,
    });

    const { getCurrentProjectId, getOpenRepository } =
      createCommandApi.mock.calls.at(-1)[0];
    expect(getCurrentProjectId()).toBe("project-1");
    expect(getOpenRepository()).toBe(openRepository);
  });
});
