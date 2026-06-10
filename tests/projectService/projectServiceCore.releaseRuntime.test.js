import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  importImageFile: vi.fn(),
  checkProjectResourceUsage: vi.fn(),
  checkSceneDeleteUsage: vi.fn(),
  repositoryService: {
    getCachedStore: vi.fn(),
    getCachedReference: vi.fn(),
    getStoreByProject: vi.fn(),
    getStoreByProjectSync: vi.fn(),
    getCurrentRepository: vi.fn(),
    getCachedRepository: vi.fn(),
    getRepositoryByProject: vi.fn(),
    getProjectInfoByProjectId: vi.fn(),
    resolveProjectReferenceByProjectId: vi.fn(),
    getRepository: vi.fn(),
    getRepositoryById: vi.fn(),
    getAdapterById: vi.fn(),
    getEnsuredProjectId: vi.fn(),
    releaseCurrentRepository: vi.fn(),
    releaseRepositoryByProjectId: vi.fn(),
    ensureRepository: vi.fn(),
    ensureProjectCompatibleByProjectId: vi.fn(),
    subscribeProjectState: vi.fn(),
    getCurrentProjectInfo: vi.fn(),
    updateCurrentProjectInfo: vi.fn(),
    updateProjectInfoByProjectId: vi.fn(),
  },
  collabService: {
    stopCollabSession: vi.fn(),
    commandApi: {
      upgradeLayoutSchemaVersion: vi.fn(),
      deleteSceneItem: vi.fn(),
    },
    addVersionToProject: vi.fn(),
    updateVersionInProject: vi.fn(),
    deleteVersionFromProject: vi.fn(),
    deleteImageIfUnused: vi.fn(),
    deleteSoundIfUnused: vi.fn(),
    deleteVideoIfUnused: vi.fn(),
    createCollabSession: vi.fn(),
    ensureCommandSessionForProject: vi.fn(),
    getCollabSession: vi.fn(),
    getCollabSessionMode: vi.fn(),
    submitCommand: vi.fn(),
  },
  assetService: {
    uploadFiles: vi.fn(),
    storeFile: vi.fn(),
    storeFileForProject: vi.fn(),
    getFileContent: vi.fn(),
    getFileByProjectId: vi.fn(),
    downloadMetadata: vi.fn(),
    loadFontFile: vi.fn(),
    detectFileType: vi.fn(),
  },
  exportService: {
    createBundle: vi.fn(),
    exportProject: vi.fn(),
    downloadBundle: vi.fn(),
    createDistributionZip: vi.fn(),
    createDistributionZipStreamed: vi.fn(),
    promptDistributionZipPath: vi.fn(),
    createDistributionZipStreamedToPath: vi.fn(),
  },
}));

vi.mock("../../src/deps/services/shared/projectRepositoryService.js", () => ({
  createProjectRepositoryService: vi.fn(() => mocked.repositoryService),
}));

vi.mock("../../src/deps/services/shared/projectCollabCore.js", () => ({
  createProjectCollabCore: vi.fn(() => mocked.collabService),
}));

vi.mock("../../src/deps/services/shared/projectAssetService.js", () => ({
  createProjectAssetService: vi.fn(() => mocked.assetService),
}));

vi.mock("../../src/deps/services/shared/projectExportService.js", () => ({
  createProjectExportService: vi.fn(() => mocked.exportService),
}));

vi.mock("../../src/deps/services/shared/resourceImports.js", () => ({
  importImageFile: mocked.importImageFile,
}));

vi.mock("../../src/deps/services/shared/resourceUsage.js", () => ({
  checkProjectResourceUsage: mocked.checkProjectResourceUsage,
  checkSceneDeleteUsage: mocked.checkSceneDeleteUsage,
}));

import { createProjectServiceCore } from "../../src/deps/services/shared/projectServiceCore.js";

describe("projectServiceCore releaseProjectRuntime", () => {
  beforeEach(() => {
    mocked.importImageFile.mockReset();
    mocked.repositoryService.getEnsuredProjectId.mockReset();
    mocked.repositoryService.ensureRepository.mockReset();
    mocked.repositoryService.getCachedRepository.mockReset();
    mocked.repositoryService.releaseCurrentRepository.mockReset();
    mocked.repositoryService.releaseRepositoryByProjectId.mockReset();
    mocked.collabService.stopCollabSession.mockReset();
    mocked.collabService.commandApi.upgradeLayoutSchemaVersion.mockReset();
    mocked.collabService.commandApi.deleteSceneItem.mockReset();
    mocked.checkProjectResourceUsage.mockReset();
    mocked.checkSceneDeleteUsage.mockReset();
  });

  it("stops the ensured collab session before releasing that project runtime", async () => {
    mocked.repositoryService.getEnsuredProjectId.mockReturnValue("project-1");
    mocked.collabService.stopCollabSession.mockResolvedValue(undefined);
    mocked.repositoryService.releaseRepositoryByProjectId.mockResolvedValue(
      undefined,
    );

    const projectService = createProjectServiceCore({
      router: {
        getPayload: () => ({ p: "project-2" }),
      },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {
        initializeProject: vi.fn(),
      },
      fileAdapter: {},
      collabAdapter: {},
    });

    await projectService.releaseProjectRuntime();

    expect(mocked.collabService.stopCollabSession).toHaveBeenCalledWith(
      "project-1",
    );
    expect(
      mocked.repositoryService.releaseRepositoryByProjectId,
    ).toHaveBeenCalledTimes(1);
    expect(
      mocked.collabService.stopCollabSession.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocked.repositoryService.releaseRepositoryByProjectId.mock
        .invocationCallOrder[0],
    );
  });

  it("falls back to releasing the current repository when no project id is available", async () => {
    mocked.repositoryService.getEnsuredProjectId.mockReturnValue(undefined);
    mocked.collabService.stopCollabSession.mockResolvedValue(undefined);
    mocked.repositoryService.releaseCurrentRepository.mockResolvedValue(
      undefined,
    );

    const projectService = createProjectServiceCore({
      router: {
        getPayload: () => ({}),
      },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {
        initializeProject: vi.fn(),
      },
      fileAdapter: {},
      collabAdapter: {},
    });

    await projectService.releaseProjectRuntime();

    expect(mocked.collabService.stopCollabSession).not.toHaveBeenCalled();
    expect(
      mocked.repositoryService.releaseRepositoryByProjectId,
    ).not.toHaveBeenCalled();
    expect(
      mocked.repositoryService.releaseCurrentRepository,
    ).toHaveBeenCalledTimes(1);
  });

  it("sets the active scene through the ensured repository contract", async () => {
    const repository = {
      setActiveSceneId: vi.fn(async () => {}),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);

    const projectService = createProjectServiceCore({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {
        initializeProject: vi.fn(),
      },
      fileAdapter: {},
      collabAdapter: {},
    });

    await projectService.setActiveSceneId("scene-1");

    expect(mocked.repositoryService.ensureRepository).toHaveBeenCalledTimes(1);
    expect(repository.setActiveSceneId).toHaveBeenCalledWith("scene-1");
  });

  it("upgrades old layout schema versions when ensuring the repository", async () => {
    const repository = {
      getState: vi.fn(() => ({
        layouts: {
          items: {
            "layout-old": {
              id: "layout-old",
              type: "layout",
            },
            "layout-current": {
              id: "layout-current",
              type: "layout",
              layoutSchemaVersion: 2,
            },
            "folder-1": {
              id: "folder-1",
              type: "folder",
            },
          },
        },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.collabService.commandApi.upgradeLayoutSchemaVersion.mockResolvedValue(
      {
        valid: true,
      },
    );

    const projectService = createProjectServiceCore({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {
        initializeProject: vi.fn(),
      },
      fileAdapter: {},
      collabAdapter: {},
    });

    await expect(projectService.ensureRepository()).resolves.toBe(repository);

    expect(
      mocked.collabService.commandApi.upgradeLayoutSchemaVersion,
    ).toHaveBeenCalledWith({
      layoutIds: ["layout-old"],
      targetSchemaVersion: 2,
    });
  });

  it("loads historical repository state through the ensured repository contract", async () => {
    const repository = {
      loadState: vi.fn(async (revision) => ({
        revision,
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);

    const projectService = createProjectServiceCore({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {
        initializeProject: vi.fn(),
      },
      fileAdapter: {},
      collabAdapter: {},
    });

    await expect(projectService.loadRepositoryState(12)).resolves.toEqual({
      revision: 12,
    });
    expect(mocked.repositoryService.ensureRepository).toHaveBeenCalledTimes(1);
    expect(repository.loadState).toHaveBeenCalledWith(12);
  });

  it("forwards the requested imageId when importing an image file", async () => {
    mocked.importImageFile.mockResolvedValue({
      valid: true,
      imageId: "image-123",
    });

    const projectService = createProjectServiceCore({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {
        initializeProject: vi.fn(),
      },
      fileAdapter: {},
      collabAdapter: {},
    });

    const file = new File(["image"], "hero.png", {
      type: "image/png",
    });

    await projectService.importImageFile({
      file,
      parentId: "folder-1",
      imageId: "image-123",
    });

    expect(mocked.importImageFile).toHaveBeenCalledWith({
      file,
      parentId: "folder-1",
      imageId: "image-123",
      uploadFiles: mocked.assetService.uploadFiles,
      createImage: mocked.collabService.commandApi.createImage,
    });
  });

  it("evicts cached repository state before initializing a project store", async () => {
    const initializeProject = vi.fn(async () => {});
    mocked.repositoryService.releaseRepositoryByProjectId.mockResolvedValue(
      undefined,
    );

    const projectService = createProjectServiceCore({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {
        initializeProject,
      },
      fileAdapter: {},
      collabAdapter: {},
    });

    await projectService.initializeProject({
      projectId: "project-1",
      template: "blank",
    });

    expect(
      mocked.repositoryService.releaseRepositoryByProjectId,
    ).toHaveBeenCalledWith("project-1");
    expect(initializeProject).toHaveBeenCalledWith({
      projectId: "project-1",
      template: "blank",
    });
    expect(
      mocked.repositoryService.releaseRepositoryByProjectId.mock
        .invocationCallOrder[0],
    ).toBeLessThan(initializeProject.mock.invocationCallOrder[0]);
  });

  it("cascades scene-owned voice resources when deleting an unused scene", async () => {
    const repositoryState = {
      project: {
        resolution: {
          width: 1920,
          height: 1080,
        },
      },
      story: {},
      scenes: {
        items: {
          "scene-1": {
            id: "scene-1",
            type: "scene",
            sections: {
              items: {},
              tree: [],
            },
          },
          "scene-2": {
            id: "scene-2",
            type: "scene",
            sections: {
              items: {},
              tree: [],
            },
          },
        },
        tree: [{ id: "scene-1" }, { id: "scene-2" }],
      },
      voices: {
        items: {
          "voice-scene-1": {
            id: "voice-scene-1",
            type: "voice",
            sceneId: "scene-1",
          },
          "voice-scene-2": {
            id: "voice-scene-2",
            type: "voice",
            sceneId: "scene-2",
          },
          "voice-folder": {
            id: "voice-folder",
            type: "folder",
            sceneId: "scene-1",
          },
        },
        tree: [
          { id: "voice-scene-1" },
          { id: "voice-scene-2" },
          { id: "voice-folder" },
        ],
      },
    };
    const repository = {
      getState: vi.fn(() => repositoryState),
      loadSceneOverviews: vi.fn(async () => ({})),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.repositoryService.getCachedRepository.mockReturnValue(repository);
    mocked.checkSceneDeleteUsage.mockReturnValue({
      isUsed: false,
    });
    mocked.collabService.commandApi.deleteSceneItem.mockResolvedValue({
      valid: true,
    });

    const projectService = createProjectServiceCore({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      now: () => 0,
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {
        initializeProject: vi.fn(),
      },
      fileAdapter: {},
      collabAdapter: {},
    });

    await expect(
      projectService.deleteSceneIfUnused({ sceneId: "scene-1" }),
    ).resolves.toMatchObject({
      deleted: true,
    });

    expect(
      mocked.collabService.commandApi.deleteSceneItem,
    ).toHaveBeenCalledWith({
      sceneIds: ["scene-1"],
      voiceIds: ["voice-scene-1"],
    });
  });
});
