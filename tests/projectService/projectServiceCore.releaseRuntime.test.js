import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  importImageFile: vi.fn(),
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
    commandApi: {},
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
  checkProjectResourceUsage: vi.fn(),
  checkSceneDeleteUsage: vi.fn(),
}));

import { createProjectServiceCore } from "../../src/deps/services/shared/projectServiceCore.js";

describe("projectServiceCore releaseProjectRuntime", () => {
  beforeEach(() => {
    mocked.importImageFile.mockReset();
    mocked.repositoryService.getEnsuredProjectId.mockReset();
    mocked.repositoryService.ensureRepository.mockReset();
    mocked.repositoryService.releaseCurrentRepository.mockReset();
    mocked.repositoryService.releaseRepositoryByProjectId.mockReset();
    mocked.collabService.stopCollabSession.mockReset();
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
});
