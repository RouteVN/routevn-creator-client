import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  importImageFile: vi.fn(),
  checkProjectResourceUsage: vi.fn(),
  checkSceneDeleteUsage: vi.fn(),
  extractFontWeightCapabilities: vi.fn(),
  fetch: vi.fn(),
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
    getEnsuredRepository: vi.fn(),
    releaseCurrentRepository: vi.fn(),
    releaseRepositoryByProjectId: vi.fn(),
    ensureRepository: vi.fn(),
    ensureProjectCompatibleByProjectId: vi.fn(),
    subscribeProjectState: vi.fn(),
    getCurrentProjectInfo: vi.fn(),
    updateCurrentProjectInfo: vi.fn(),
    updateProjectInfoByProjectId: vi.fn(),
    getCurrentAssetPackage: vi.fn(),
    updateCurrentAssetPackage: vi.fn(),
    getCurrentPlatformDetails: vi.fn(),
    getCurrentPlatformDetailsDefaults: vi.fn(),
    createCurrentPlatformDetails: vi.fn(),
    updateCurrentPlatformDetails: vi.fn(),
  },
  projectStore: {
    app: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  collabService: {
    stopCollabSession: vi.fn(),
    commandApi: {
      upgradeLayoutSchemaVersion: vi.fn(),
      updateTextStyle: vi.fn(),
      updateLayoutElement: vi.fn(),
      updateLineActions: vi.fn(),
      updateControlItem: vi.fn(),
      updateControlElement: vi.fn(),
      updateFont: vi.fn(),
      updateSound: vi.fn(),
      deleteSceneItem: vi.fn(),
      waitForChanges: vi.fn(),
      runAfterChanges: vi.fn(),
    },
    addVersionToProject: vi.fn(),
    updateVersionInProject: vi.fn(),
    deleteVersionFromProject: vi.fn(),
    deleteImageIfUnused: vi.fn(),
    deleteSoundIfUnused: vi.fn(),
    deleteVideoIfUnused: vi.fn(),
    deleteParticleIfUnused: vi.fn(),
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

vi.mock("../../src/internal/fontCapabilities.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    extractFontWeightCapabilities: mocked.extractFontWeightCapabilities,
  };
});

import { createProjectCollabCore } from "../../src/deps/services/shared/projectCollabCore.js";
import { createProjectServiceCore } from "../../src/deps/services/shared/projectServiceCore.js";

const createTestProjectService = (overrides = {}) =>
  createProjectServiceCore({
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
    ...overrides,
  });

describe("projectServiceCore releaseProjectRuntime", () => {
  beforeEach(() => {
    mocked.importImageFile.mockReset();
    mocked.repositoryService.getEnsuredProjectId.mockReset();
    mocked.repositoryService.ensureRepository.mockReset();
    mocked.repositoryService.getCachedStore.mockReset();
    mocked.repositoryService.getCachedRepository.mockReset();
    mocked.repositoryService.releaseCurrentRepository.mockReset();
    mocked.repositoryService.releaseRepositoryByProjectId.mockReset();
    mocked.repositoryService.getCurrentPlatformDetails.mockReset();
    mocked.collabService.stopCollabSession.mockReset();
    mocked.collabService.deleteImageIfUnused.mockReset();
    mocked.collabService.commandApi.upgradeLayoutSchemaVersion.mockReset();
    mocked.collabService.commandApi.updateTextStyle.mockReset();
    mocked.collabService.commandApi.updateLayoutElement.mockReset();
    mocked.collabService.commandApi.updateLineActions.mockReset();
    mocked.collabService.commandApi.updateControlItem.mockReset();
    mocked.collabService.commandApi.updateControlElement.mockReset();
    mocked.collabService.commandApi.updateFont.mockReset();
    mocked.collabService.commandApi.updateSound.mockReset();
    mocked.assetService.storeFile.mockReset();
    mocked.collabService.commandApi.deleteSceneItem.mockReset();
    mocked.collabService.commandApi.waitForChanges.mockReset();
    mocked.collabService.commandApi.waitForChanges.mockResolvedValue(undefined);
    mocked.collabService.commandApi.runAfterChanges.mockReset();
    mocked.collabService.commandApi.runAfterChanges.mockImplementation((task) =>
      task(),
    );
    mocked.assetService.getFileContent.mockReset();
    mocked.extractFontWeightCapabilities.mockReset();
    mocked.fetch.mockReset();
    mocked.projectStore.app.get.mockReset();
    mocked.projectStore.app.set.mockReset();
    mocked.checkProjectResourceUsage.mockReset();
    mocked.checkSceneDeleteUsage.mockReset();

    mocked.repositoryService.getCachedStore.mockReturnValue(
      mocked.projectStore,
    );
    mocked.projectStore.app.get.mockResolvedValue(undefined);
    mocked.projectStore.app.set.mockResolvedValue(undefined);
    mocked.repositoryService.getCurrentPlatformDetails.mockResolvedValue(
      undefined,
    );
    vi.stubGlobal("fetch", mocked.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports an image used by platform release icons", async () => {
    const repository = {
      getState: vi.fn(() => ({
        images: {
          items: {
            "image-1": {
              id: "image-1",
              type: "image",
              fileId: "file-icon-1",
            },
          },
        },
        layouts: { items: {} },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.checkProjectResourceUsage.mockResolvedValue({
      inProps: {},
      isUsed: false,
      count: 0,
    });
    mocked.repositoryService.getCurrentPlatformDetails.mockImplementation(
      async (platform) => {
        if (platform === "macos") {
          return { iconFileId: "file-icon-1" };
        }
        if (platform === "web") {
          return {
            applicationName: "Web Project",
            applicationIdentifier: "com.example.web-project",
          };
        }
        return { iconFileId: "file-other" };
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

    await expect(
      projectService.checkResourceUsage({
        itemId: "image-1",
        checkTargets: ["scenes", "layouts"],
      }),
    ).resolves.toEqual({
      inProps: {
        platformDetails: [{ property: "macos.iconFileId" }],
      },
      isUsed: true,
      count: 1,
    });
  });

  it("blocks direct image deletion when a Platform Details icon uses its file", async () => {
    const repository = {
      getState: vi.fn(() => ({
        images: {
          items: {
            "image-1": {
              id: "image-1",
              type: "image",
              fileId: "file-icon-1",
            },
          },
        },
        layouts: { items: {} },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.repositoryService.getCurrentPlatformDetails.mockImplementation(
      async (platform) =>
        platform === "windows" ? { iconFileId: "file-icon-1" } : undefined,
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

    await expect(
      projectService.deleteImageIfUnused({
        imageId: "image-1",
        checkTargets: ["scenes", "layouts"],
      }),
    ).resolves.toEqual({
      deleted: false,
      usage: {
        inProps: {
          platformDetails: [{ property: "windows.iconFileId" }],
        },
        isUsed: true,
        count: 1,
      },
    });
    expect(mocked.collabService.deleteImageIfUnused).not.toHaveBeenCalled();
  });

  it("reports Android adaptive and splash icons that use an image file", async () => {
    const repository = {
      getState: vi.fn(() => ({
        images: {
          items: {
            "image-1": {
              id: "image-1",
              type: "image",
              fileId: "file-splash-1",
            },
          },
        },
        layouts: { items: {} },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.checkProjectResourceUsage.mockResolvedValue({
      inProps: {},
      isUsed: false,
      count: 0,
    });
    mocked.repositoryService.getCurrentPlatformDetails.mockImplementation(
      async (platform) =>
        platform === "android"
          ? {
              iconFileId: "file-icon-1",
              adaptiveIconFileId: "file-adaptive-1",
              splashIconFileId: "file-splash-1",
            }
          : undefined,
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

    await expect(
      projectService.checkResourceUsage({
        itemId: "image-1",
        checkTargets: ["scenes", "layouts"],
      }),
    ).resolves.toEqual({
      inProps: {
        platformDetails: [{ property: "android.splashIconFileId" }],
      },
      isUsed: true,
      count: 1,
    });
  });

  it("delegates image deletion when platform details does not use its file", async () => {
    const repository = {
      getState: vi.fn(() => ({
        images: {
          items: {
            "image-1": {
              id: "image-1",
              type: "image",
              fileId: "file-image-1",
            },
          },
        },
        layouts: { items: {} },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.collabService.deleteImageIfUnused.mockResolvedValue({
      deleted: true,
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
      projectService.deleteImageIfUnused({
        imageId: "image-1",
        checkTargets: ["scenes", "layouts"],
      }),
    ).resolves.toEqual({ deleted: true });
    expect(mocked.collabService.deleteImageIfUnused).toHaveBeenCalledWith({
      imageId: "image-1",
      checkTargets: ["scenes", "layouts"],
    });
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

  it("makes changes in the open project while the route already names the next page", () => {
    mocked.repositoryService.getEnsuredProjectId.mockReturnValue("project-1");
    createTestProjectService({ router: { getPayload: () => ({}) } });

    const { getOpenProjectId, getOpenRepository } =
      createProjectCollabCore.mock.calls.at(-1)[0];
    expect(getOpenProjectId()).toBe("project-1");
    expect(getOpenRepository).toBe(
      mocked.repositoryService.getEnsuredRepository,
    );
  });

  it("waits for the changes still waiting to run before it closes the project", async () => {
    mocked.repositoryService.getEnsuredProjectId.mockReturnValue("project-1");
    mocked.collabService.stopCollabSession.mockResolvedValue(undefined);
    mocked.repositoryService.releaseRepositoryByProjectId.mockResolvedValue(
      undefined,
    );
    let finishChanges;
    mocked.collabService.commandApi.waitForChanges.mockReturnValue(
      new Promise((resolve) => {
        finishChanges = resolve;
      }),
    );
    const projectService = createTestProjectService();

    const releasing = projectService.releaseProjectRuntime();
    await Promise.resolve();
    expect(mocked.collabService.stopCollabSession).not.toHaveBeenCalled();
    expect(
      mocked.repositoryService.releaseRepositoryByProjectId,
    ).not.toHaveBeenCalled();

    finishChanges();
    await releasing;
    expect(
      mocked.repositoryService.releaseRepositoryByProjectId,
    ).toHaveBeenCalledWith("project-1");
  });

  it("closes the project as a step among the changes, so a change made meanwhile waits for it", async () => {
    mocked.repositoryService.getEnsuredProjectId.mockReturnValue("project-1");
    mocked.collabService.stopCollabSession.mockResolvedValue(undefined);
    mocked.repositoryService.releaseRepositoryByProjectId.mockResolvedValue(
      undefined,
    );
    const closingSteps = [];
    mocked.collabService.commandApi.runAfterChanges.mockImplementation(
      async (task) => {
        closingSteps.push("closing starts");
        await task();
        closingSteps.push("closing ends");
      },
    );
    mocked.collabService.stopCollabSession.mockImplementation(async () => {
      closingSteps.push("session stopped");
    });
    const projectService = createTestProjectService();

    await projectService.releaseProjectRuntime();

    expect(closingSteps).toEqual([
      "closing starts",
      "session stopped",
      "closing ends",
    ]);
    expect(
      mocked.collabService.commandApi.waitForChanges.mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      mocked.collabService.commandApi.runAfterChanges.mock
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

  it("caches scene text stats through the ensured repository contract", async () => {
    const textStats = {
      lineCount: 3,
      wordCount: 12,
      characterCount: 48,
      language: "en",
    };
    const repository = {
      cacheSceneTextStats: vi.fn(async () => textStats),
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

    await expect(
      projectService.cacheSceneTextStats({
        sceneId: "scene-1",
        textStats,
      }),
    ).resolves.toEqual(textStats);

    expect(repository.cacheSceneTextStats).toHaveBeenCalledWith({
      sceneId: "scene-1",
      textStats,
    });
  });

  it("ensures scene text stats through the ensured repository contract", async () => {
    const textStatsBySceneId = {
      "scene-1": {
        lineCount: 3,
        wordCount: 12,
        characterCount: 48,
        language: "en",
      },
    };
    const repository = {
      ensureSceneTextStats: vi.fn(async () => textStatsBySceneId),
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

    await expect(
      projectService.ensureSceneTextStats({
        sceneIds: ["scene-1"],
        language: "en",
      }),
    ).resolves.toEqual(textStatsBySceneId);
    expect(repository.ensureSceneTextStats).toHaveBeenCalledWith({
      sceneIds: ["scene-1"],
      language: "en",
    });
  });

  it("merges separately cached text stats into loaded scene overviews", async () => {
    const textStats = {
      lineCount: 3,
      wordCount: 12,
      characterCount: 48,
      language: "en",
    };
    const repository = {
      loadSceneOverviews: vi.fn(async () => ({
        "scene-1": {
          sceneId: "scene-1",
          textStats: {
            lineCount: 24,
            wordCount: 99,
            characterCount: 396,
            language: "en",
          },
        },
      })),
      loadSceneTextStats: vi.fn(async () => ({
        "scene-1": textStats,
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

    await expect(
      projectService.loadSceneOverviews({ sceneIds: ["scene-1"] }),
    ).resolves.toEqual({
      "scene-1": {
        sceneId: "scene-1",
        textStats,
      },
    });
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

  it("patches legacy default menu text styles before recording completion", async () => {
    const repository = {
      getState: vi.fn(() => ({
        textStyles: {
          items: {
            saV5A4pkvHRb: {
              id: "saV5A4pkvHRb",
              type: "textStyle",
              fontWeight: "400",
            },
            e2WbW3vcPZR9: {
              id: "e2WbW3vcPZR9",
              type: "textStyle",
            },
          },
        },
        layouts: {
          items: {
            fKr5fa67MQWh: {
              id: "fKr5fa67MQWh",
              type: "layout",
              layoutSchemaVersion: 2,
              elements: {
                items: {
                  icn4dknq2kyp: {
                    id: "icn4dknq2kyp",
                    type: "text",
                    textStyleId: "5rwEfyx2GBEi",
                  },
                },
              },
            },
          },
        },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.collabService.commandApi.updateTextStyle.mockResolvedValue({
      valid: true,
    });
    mocked.collabService.commandApi.updateLayoutElement.mockResolvedValue({
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

    await expect(projectService.ensureRepository()).resolves.toBe(repository);

    expect(mocked.projectStore.app.get).toHaveBeenCalledWith(
      "contentPatch.defaultMenuTextStyles-1-9-1",
    );
    expect(
      mocked.collabService.commandApi.updateTextStyle,
    ).toHaveBeenCalledWith({
      textStyleId: "saV5A4pkvHRb",
      data: {
        fontWeight: "700",
      },
    });
    expect(
      mocked.collabService.commandApi.updateLayoutElement,
    ).toHaveBeenCalledWith({
      layoutId: "fKr5fa67MQWh",
      elementId: "icn4dknq2kyp",
      data: {
        textStyleId: "e2WbW3vcPZR9",
      },
      replace: false,
    });
    expect(mocked.projectStore.app.set).toHaveBeenCalledWith(
      "contentPatch.defaultMenuTextStyles-1-9-1",
      true,
    );
    expect(
      mocked.collabService.commandApi.updateTextStyle.mock
        .invocationCallOrder[0],
    ).toBeLessThan(mocked.projectStore.app.set.mock.invocationCallOrder[0]);
    expect(
      mocked.collabService.commandApi.updateLayoutElement.mock
        .invocationCallOrder[0],
    ).toBeLessThan(mocked.projectStore.app.set.mock.invocationCallOrder[0]);
  });

  it("skips the default menu text-style patch when already completed", async () => {
    const repository = {
      getState: vi.fn(() => ({
        layouts: {
          items: {},
        },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.projectStore.app.get.mockResolvedValue(true);

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

    await projectService.ensureRepository();

    expect(
      mocked.collabService.commandApi.updateTextStyle,
    ).not.toHaveBeenCalled();
    expect(
      mocked.collabService.commandApi.updateLayoutElement,
    ).not.toHaveBeenCalled();
    expect(mocked.projectStore.app.set).not.toHaveBeenCalled();
  });

  it("does not read the patch markers again when a page ensures the open project", async () => {
    const repository = {
      getState: vi.fn(() => ({
        layouts: {
          items: {},
        },
      })),
    };
    let routePayload = { p: "project-1" };
    let leaveOnNextMarkerRead = false;
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.repositoryService.getEnsuredProjectId.mockReturnValue("project-1");
    // Like the repository service, the cached store belongs to the project
    // in the route.
    mocked.repositoryService.getCachedStore.mockImplementation(() => {
      if (routePayload.p !== "project-1") {
        throw new Error(
          "Adapter not initialized. Call ensureRepository() first.",
        );
      }
      return mocked.projectStore;
    });
    mocked.projectStore.app.get.mockImplementation(async () => {
      if (leaveOnNextMarkerRead) {
        routePayload = {};
      }
      return true;
    });
    const projectService = createTestProjectService({
      router: {
        getPayload: () => routePayload,
      },
    });

    // The route opens the project and evaluates its content patches.
    await projectService.ensureRepository();
    expect(mocked.projectStore.app.get).toHaveBeenCalledTimes(3);

    // A page ensures the open project again, and the user leaves the project
    // while that call would read the project store.
    leaveOnNextMarkerRead = true;
    await expect(projectService.ensureRepository()).resolves.toBe(repository);
    expect(mocked.projectStore.app.get).toHaveBeenCalledTimes(3);
  });

  it("evaluates the content patches again for a reopened project", async () => {
    const firstRepository = {
      getState: vi.fn(() => ({ layouts: { items: {} } })),
    };
    const reopenedRepository = {
      getState: vi.fn(() => ({ layouts: { items: {} } })),
    };
    mocked.repositoryService.ensureRepository
      .mockResolvedValueOnce(firstRepository)
      .mockResolvedValueOnce(reopenedRepository);
    mocked.projectStore.app.get.mockResolvedValue(true);
    const projectService = createTestProjectService();

    await projectService.ensureRepository();
    await projectService.ensureRepository();

    expect(mocked.projectStore.app.get).toHaveBeenCalledTimes(6);
  });

  it("defers automatic content patches until the platform marks the project ready", async () => {
    const repository = {
      getState: vi.fn(() => ({
        textStyles: {
          items: {},
        },
        layouts: {
          items: {},
        },
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
      shouldApplyProjectContentPatchesOnEnsure: () => false,
    });

    await projectService.ensureRepository();

    expect(mocked.projectStore.app.get).not.toHaveBeenCalled();
    expect(mocked.projectStore.app.set).not.toHaveBeenCalled();

    await projectService.ensureProjectContentPatches();

    expect(mocked.projectStore.app.get).toHaveBeenCalledWith(
      "contentPatch.defaultMenuTextStyles-1-9-1",
    );
    expect(mocked.projectStore.app.set).toHaveBeenCalledWith(
      "contentPatch.defaultMenuTextStyles-1-9-1",
      true,
    );
    expect(mocked.projectStore.app.set).toHaveBeenCalledWith(
      "contentPatch.fontWeightMetadata-1-10-0",
      true,
    );
  });

  it("does not patch default menu values that no longer match the legacy values", async () => {
    const repository = {
      getState: vi.fn(() => ({
        textStyles: {
          items: {
            saV5A4pkvHRb: {
              id: "saV5A4pkvHRb",
              type: "textStyle",
              fontWeight: "500",
            },
            e2WbW3vcPZR9: {
              id: "e2WbW3vcPZR9",
              type: "textStyle",
            },
          },
        },
        layouts: {
          items: {
            fKr5fa67MQWh: {
              id: "fKr5fa67MQWh",
              type: "layout",
              layoutSchemaVersion: 2,
              elements: {
                items: {
                  icn4dknq2kyp: {
                    id: "icn4dknq2kyp",
                    type: "text",
                    textStyleId: "custom-text-style",
                  },
                },
              },
            },
          },
        },
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

    await projectService.ensureRepository();

    expect(
      mocked.collabService.commandApi.updateTextStyle,
    ).not.toHaveBeenCalled();
    expect(
      mocked.collabService.commandApi.updateLayoutElement,
    ).not.toHaveBeenCalled();
    expect(mocked.projectStore.app.set).toHaveBeenCalledWith(
      "contentPatch.defaultMenuTextStyles-1-9-1",
      true,
    );
  });

  it("records completion without updates when the default menu ids are absent", async () => {
    const repository = {
      getState: vi.fn(() => ({
        textStyles: {
          items: {},
        },
        layouts: {
          items: {},
        },
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

    await projectService.ensureRepository();

    expect(
      mocked.collabService.commandApi.updateTextStyle,
    ).not.toHaveBeenCalled();
    expect(
      mocked.collabService.commandApi.updateLayoutElement,
    ).not.toHaveBeenCalled();
    expect(mocked.projectStore.app.set).toHaveBeenCalledWith(
      "contentPatch.defaultMenuTextStyles-1-9-1",
      true,
    );
  });

  it("does not record completion when a default menu patch update fails", async () => {
    const repository = {
      getState: vi.fn(() => ({
        textStyles: {
          items: {
            saV5A4pkvHRb: {
              id: "saV5A4pkvHRb",
              type: "textStyle",
              fontWeight: "400",
            },
          },
        },
        layouts: {
          items: {},
        },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.collabService.commandApi.updateTextStyle.mockResolvedValue({
      valid: false,
      error: {
        message: "Text style patch failed.",
      },
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

    await expect(projectService.ensureRepository()).rejects.toThrow(
      "Text style patch failed.",
    );

    expect(mocked.projectStore.app.set).not.toHaveBeenCalled();
    expect(
      mocked.collabService.commandApi.updateLayoutElement,
    ).not.toHaveBeenCalled();
  });

  it("migrates incomplete TTF, OTF, WOFF, and WOFF2 weight metadata without inspecting complete fonts", async () => {
    const repository = {
      getState: vi.fn(() => ({
        files: {
          items: {
            "file-static": { mimeType: "font/ttf" },
            "file-variable": { mimeType: "application/x-font-otf" },
            "file-complete": { mimeType: "font/ttf" },
            "file-woff": { mimeType: "font/woff" },
            "file-woff2": { mimeType: "application/font-woff2" },
          },
        },
        fonts: {
          items: {
            "font-static": {
              id: "font-static",
              type: "font",
              fileId: "file-static",
            },
            "font-variable": {
              id: "font-variable",
              type: "font",
              fileId: "file-variable",
              minWeight: 200,
            },
            "font-complete": {
              id: "font-complete",
              type: "font",
              fileId: "file-complete",
              minWeight: 400,
              defaultWeight: 400,
              maxWeight: 400,
            },
            "font-woff": {
              id: "font-woff",
              type: "font",
              fileId: "file-woff",
            },
            "font-woff2": {
              id: "font-woff2",
              type: "font",
              fileId: "file-woff2",
            },
          },
        },
        layouts: { items: {} },
        textStyles: { items: {} },
      })),
    };
    const revoke = vi.fn();
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.projectStore.app.get.mockImplementation(async (key) =>
      key === "contentPatch.defaultMenuTextStyles-1-9-1" ? true : undefined,
    );
    mocked.assetService.getFileContent.mockImplementation(async (fileId) => ({
      url: `font://${fileId}`,
      revoke,
    }));
    mocked.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    });
    mocked.extractFontWeightCapabilities
      .mockReturnValueOnce({
        kind: "static",
        minWeight: 400,
        defaultWeight: 400,
        maxWeight: 400,
      })
      .mockReturnValueOnce({
        kind: "variable",
        minWeight: 100,
        defaultWeight: 500,
        maxWeight: 900,
      })
      .mockReturnValueOnce({
        kind: "static",
        minWeight: 300,
        defaultWeight: 300,
        maxWeight: 300,
      })
      .mockReturnValueOnce({
        kind: "variable",
        minWeight: 200,
        defaultWeight: 400,
        maxWeight: 800,
      });
    mocked.collabService.commandApi.updateFont.mockResolvedValue({
      valid: true,
    });

    const projectService = createTestProjectService();
    await projectService.ensureRepository();

    expect(mocked.assetService.getFileContent.mock.calls).toEqual([
      ["file-static"],
      ["file-variable"],
      ["file-woff"],
      ["file-woff2"],
    ]);
    expect(mocked.collabService.commandApi.updateFont.mock.calls).toEqual([
      [
        {
          fontId: "font-static",
          data: {
            minWeight: 400,
            defaultWeight: 400,
            maxWeight: 400,
          },
        },
      ],
      [
        {
          fontId: "font-variable",
          data: {
            minWeight: 100,
            defaultWeight: 500,
            maxWeight: 900,
          },
        },
      ],
      [
        {
          fontId: "font-woff",
          data: {
            minWeight: 300,
            defaultWeight: 300,
            maxWeight: 300,
          },
        },
      ],
      [
        {
          fontId: "font-woff2",
          data: {
            minWeight: 200,
            defaultWeight: 400,
            maxWeight: 800,
          },
        },
      ],
    ]);
    expect(revoke).toHaveBeenCalledTimes(4);
    expect(mocked.projectStore.app.set).toHaveBeenCalledWith(
      "contentPatch.fontWeightMetadata-1-10-0",
      true,
    );
  });

  it("does not inspect fonts when the weight metadata patch is already complete", async () => {
    const repository = {
      getState: vi.fn(() => ({
        files: {
          items: {
            "file-font": { mimeType: "font/ttf" },
          },
        },
        fonts: {
          items: {
            "font-1": {
              id: "font-1",
              type: "font",
              fileId: "file-font",
            },
          },
        },
        layouts: { items: {} },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.projectStore.app.get.mockResolvedValue(true);

    const projectService = createTestProjectService();
    await projectService.ensureRepository();

    expect(mocked.assetService.getFileContent).not.toHaveBeenCalled();
    expect(mocked.extractFontWeightCapabilities).not.toHaveBeenCalled();
    expect(mocked.collabService.commandApi.updateFont).not.toHaveBeenCalled();
    expect(mocked.projectStore.app.set).not.toHaveBeenCalled();
  });

  it("records the font metadata patch after leaving unreadable weight fields blank", async () => {
    const repository = {
      getState: vi.fn(() => ({
        files: {
          items: {
            "file-font": { mimeType: "font/ttf" },
          },
        },
        fonts: {
          items: {
            "font-1": {
              id: "font-1",
              type: "font",
              fileId: "file-font",
            },
          },
        },
        layouts: { items: {} },
        textStyles: { items: {} },
      })),
    };
    const inspectionError = Object.assign(new Error("Unreadable weight."), {
      code: "unreadable_font_weight",
    });
    const revoke = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.projectStore.app.get.mockImplementation(async (key) =>
      key === "contentPatch.defaultMenuTextStyles-1-9-1" ? true : undefined,
    );
    mocked.assetService.getFileContent.mockResolvedValue({
      url: "font://file-font",
      revoke,
    });
    mocked.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    });
    mocked.extractFontWeightCapabilities.mockImplementation(() => {
      throw inspectionError;
    });

    const projectService = createTestProjectService();
    await projectService.ensureRepository();

    expect(mocked.collabService.commandApi.updateFont).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(mocked.projectStore.app.set).toHaveBeenCalledWith(
      "contentPatch.fontWeightMetadata-1-10-0",
      true,
    );
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("does not record font metadata completion when an update fails", async () => {
    const repository = {
      getState: vi.fn(() => ({
        files: {
          items: {
            "file-font": { mimeType: "font/otf" },
          },
        },
        fonts: {
          items: {
            "font-1": {
              id: "font-1",
              type: "font",
              fileId: "file-font",
            },
          },
        },
        layouts: { items: {} },
        textStyles: { items: {} },
      })),
    };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    mocked.projectStore.app.get.mockImplementation(async (key) =>
      key === "contentPatch.defaultMenuTextStyles-1-9-1" ? true : undefined,
    );
    mocked.assetService.getFileContent.mockResolvedValue({
      url: "font://file-font",
    });
    mocked.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    });
    mocked.extractFontWeightCapabilities.mockReturnValue({
      kind: "static",
      minWeight: 600,
      defaultWeight: 600,
      maxWeight: 600,
    });
    mocked.collabService.commandApi.updateFont.mockResolvedValue({
      valid: false,
      error: { message: "Font update failed." },
    });

    const projectService = createTestProjectService();
    await expect(projectService.ensureRepository()).rejects.toThrow(
      "Font update failed.",
    );

    expect(mocked.projectStore.app.set).not.toHaveBeenCalledWith(
      "contentPatch.fontWeightMetadata-1-10-0",
      true,
    );
  });

  describe("section transition reset story patch", () => {
    const PATCH_KEY = "contentPatch.sectionTransitionResetStory-1-22-0";
    const OTHER_PATCH_KEYS = [
      "contentPatch.defaultMenuTextStyles-1-9-1",
      "contentPatch.fontWeightMetadata-1-10-0",
    ];

    const createLegacyResetState = () => ({
      scenes: {
        items: {
          "scene-1": {
            id: "scene-1",
            type: "scene",
            sections: {
              items: {
                "section-1": {
                  id: "section-1",
                  lines: {
                    items: {
                      "line-1": {
                        id: "line-1",
                        actions: {
                          dialogue: { content: [{ text: "Line One" }] },
                        },
                      },
                      "line-2": {
                        id: "line-2",
                        actions: {
                          conditional: {
                            branches: [
                              {
                                when: { eq: [{ var: "variables.flag" }, 1] },
                                actions: {
                                  resetStoryAtSection: {
                                    sectionId: "section-2",
                                  },
                                },
                              },
                              { actions: {} },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "scene-2": {
            id: "scene-2",
            type: "scene",
            sections: {
              items: {
                "section-2": {
                  id: "section-2",
                  lines: {
                    items: {
                      "line-3": {
                        id: "line-3",
                        actions: {
                          background: { resourceId: "image-1" },
                          resetStoryAtSection: {
                            sectionId: "section-1",
                            screen: {
                              animations: { resourceId: "animation-1" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "folder-1": { id: "folder-1", type: "folder" },
        },
      },
      layouts: {
        items: {
          "layout-1": {
            id: "layout-1",
            type: "layout",
            layoutSchemaVersion: 2,
            elements: {
              items: {
                "element-1": {
                  id: "element-1",
                  type: "rect",
                  width: 100,
                  click: {
                    payload: {
                      actions: {
                        showConfirmDialog: {
                          resourceId: "layout-2",
                          confirmActions: {
                            popOverlay: {},
                            resetStoryAtSection: { sectionId: "section-1" },
                          },
                        },
                      },
                    },
                  },
                },
                "element-2": {
                  id: "element-2",
                  type: "text",
                  click: {
                    payload: { actions: { nextLine: {} } },
                  },
                },
              },
            },
          },
        },
      },
      controls: {
        items: {
          "control-1": {
            id: "control-1",
            type: "control",
            keyboard: {
              esc: {
                payload: {
                  actions: {
                    resetStoryAtSection: { sectionId: "section-1" },
                  },
                },
              },
              enter: { payload: { actions: { nextLine: {} } } },
            },
            keyup: {
              ctrl: { payload: { actions: { stopSkipMode: {} } } },
            },
            elements: {
              items: {
                "control-element-1": {
                  id: "control-element-1",
                  type: "rect",
                  rightClick: {
                    payload: {
                      actions: {
                        resetStoryAtSection: { sectionId: "section-2" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const openProjectWith = async (state, overrides) => {
      const repository = { getState: vi.fn(() => state) };
      mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
      mocked.projectStore.app.get.mockImplementation(async (key) =>
        OTHER_PATCH_KEYS.includes(key) ? true : undefined,
      );
      const projectService = createTestProjectService(overrides);
      return { projectService, repository };
    };

    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { commandApi } = mocked.collabService;
      commandApi.updateLineActions.mockResolvedValue({ valid: true });
      commandApi.updateLayoutElement.mockResolvedValue({ valid: true });
      commandApi.updateControlItem.mockResolvedValue({ valid: true });
      commandApi.updateControlElement.mockResolvedValue({ valid: true });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("rewrites reset actions in lines, layouts, and controls before recording completion", async () => {
      const { commandApi } = mocked.collabService;
      const state = createLegacyResetState();
      const { projectService } = await openProjectWith(state);

      await projectService.ensureRepository();

      expect(commandApi.updateLineActions.mock.calls).toEqual([
        [
          {
            lineId: "line-2",
            data: {
              conditional: {
                branches: [
                  {
                    when: { eq: [{ var: "variables.flag" }, 1] },
                    actions: {
                      sectionTransition: {
                        sceneId: "scene-2",
                        sectionId: "section-2",
                        resetStory: true,
                      },
                    },
                  },
                  { actions: {} },
                ],
              },
            },
            replace: true,
          },
        ],
        [
          {
            lineId: "line-3",
            data: {
              background: { resourceId: "image-1" },
              sectionTransition: {
                sceneId: "scene-1",
                sectionId: "section-1",
                screen: { animations: { resourceId: "animation-1" } },
                resetStory: true,
              },
            },
            replace: true,
          },
        ],
      ]);
      expect(commandApi.updateLayoutElement.mock.calls).toEqual([
        [
          {
            layoutId: "layout-1",
            elementId: "element-1",
            data: {
              click: {
                payload: {
                  actions: {
                    showConfirmDialog: {
                      resourceId: "layout-2",
                      confirmActions: {
                        popOverlay: {},
                        sectionTransition: {
                          sceneId: "scene-1",
                          sectionId: "section-1",
                          resetStory: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            replace: false,
          },
        ],
      ]);
      expect(commandApi.updateControlItem.mock.calls).toEqual([
        [
          {
            controlId: "control-1",
            data: {
              keyboard: {
                esc: {
                  payload: {
                    actions: {
                      sectionTransition: {
                        sceneId: "scene-1",
                        sectionId: "section-1",
                        resetStory: true,
                      },
                    },
                  },
                },
                enter: { payload: { actions: { nextLine: {} } } },
              },
            },
          },
        ],
      ]);
      expect(commandApi.updateControlElement.mock.calls).toEqual([
        [
          {
            controlId: "control-1",
            elementId: "control-element-1",
            data: {
              rightClick: {
                payload: {
                  actions: {
                    sectionTransition: {
                      sceneId: "scene-2",
                      sectionId: "section-2",
                      resetStory: true,
                    },
                  },
                },
              },
            },
            replace: false,
          },
        ],
      ]);
      expect(mocked.projectStore.app.set).toHaveBeenCalledWith(PATCH_KEY, true);
      const markerOrder = mocked.projectStore.app.set.mock.invocationCallOrder;
      for (const update of [
        commandApi.updateLineActions,
        commandApi.updateLayoutElement,
        commandApi.updateControlItem,
        commandApi.updateControlElement,
      ]) {
        expect(update.mock.invocationCallOrder.at(-1)).toBeLessThan(
          markerOrder.at(-1),
        );
      }
      // The repository state is read-only projection data.
      expect(state).toEqual(createLegacyResetState());
    });

    it("skips the patch when already completed", async () => {
      const { commandApi } = mocked.collabService;
      const { projectService, repository } = await openProjectWith(
        createLegacyResetState(),
      );
      mocked.projectStore.app.get.mockResolvedValue(true);

      await projectService.ensureRepository();

      expect(commandApi.updateLineActions).not.toHaveBeenCalled();
      expect(commandApi.updateLayoutElement).not.toHaveBeenCalled();
      expect(commandApi.updateControlItem).not.toHaveBeenCalled();
      expect(commandApi.updateControlElement).not.toHaveBeenCalled();
      expect(mocked.projectStore.app.set).not.toHaveBeenCalled();
      // Only layout schema validation reads state; the marked content patch must not.
      expect(repository.getState).toHaveBeenCalledOnce();
    });

    it("records completion without updates when the project has no reset actions", async () => {
      const { commandApi } = mocked.collabService;
      const state = createLegacyResetState();
      state.scenes.items["scene-1"].sections.items["section-1"].lines.items[
        "line-2"
      ].actions = {
        sectionTransition: {
          sceneId: "scene-2",
          sectionId: "section-2",
          resetStory: true,
        },
      };
      delete state.scenes.items["scene-2"].sections.items["section-2"].lines
        .items["line-3"].actions.resetStoryAtSection;
      state.layouts.items = {};
      state.controls.items = {};
      const { projectService } = await openProjectWith(state);

      await projectService.ensureRepository();

      expect(commandApi.updateLineActions).not.toHaveBeenCalled();
      expect(commandApi.updateLayoutElement).not.toHaveBeenCalled();
      expect(commandApi.updateControlItem).not.toHaveBeenCalled();
      expect(commandApi.updateControlElement).not.toHaveBeenCalled();
      expect(mocked.projectStore.app.set).toHaveBeenCalledWith(PATCH_KEY, true);
    });

    it("records completion for a project without scenes, layouts, or controls", async () => {
      const { projectService } = await openProjectWith({});

      await projectService.ensureRepository();

      expect(mocked.projectStore.app.set).toHaveBeenCalledWith(PATCH_KEY, true);
    });

    it("leaves resets it cannot rewrite safely", async () => {
      const { commandApi } = mocked.collabService;
      const state = createLegacyResetState();
      const lines =
        state.scenes.items["scene-1"].sections.items["section-1"].lines.items;
      // The section was deleted.
      lines["line-1"].actions = {
        resetStoryAtSection: { sectionId: "section-9" },
      };
      // Two navigation actions: which one was meant is unknown.
      lines["line-2"].actions = {
        resetStoryAtSection: { sectionId: "section-2" },
        sectionTransition: { sceneId: "scene-1", sectionId: "section-1" },
      };
      state.layouts.items = {};
      state.controls.items = {};
      const { projectService } = await openProjectWith(state);

      await projectService.ensureRepository();

      expect(commandApi.updateLineActions.mock.calls).toEqual([
        [expect.objectContaining({ lineId: "line-3" })],
      ]);
      expect(mocked.projectStore.app.set).toHaveBeenCalledWith(PATCH_KEY, true);
    });

    it.each([
      ["updateLineActions"],
      ["updateLayoutElement"],
      ["updateControlItem"],
      ["updateControlElement"],
    ])(
      "does not record completion when %s is rejected",
      async (commandName) => {
        mocked.collabService.commandApi[commandName].mockResolvedValue({
          valid: false,
          error: { message: "Update rejected." },
        });
        const { projectService, repository } = await openProjectWith(
          createLegacyResetState(),
        );

        await expect(projectService.ensureRepository()).resolves.toBe(
          repository,
        );

        expect(
          mocked.collabService.commandApi.updateLineActions,
        ).toHaveBeenCalledTimes(2);
        expect(
          mocked.collabService.commandApi.updateLayoutElement,
        ).toHaveBeenCalledOnce();
        expect(
          mocked.collabService.commandApi.updateControlItem,
        ).toHaveBeenCalledOnce();
        expect(
          mocked.collabService.commandApi.updateControlElement,
        ).toHaveBeenCalledOnce();
        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining("Could not migrate the reset action of"),
          "Update rejected.",
        );

        expect(mocked.projectStore.app.set).not.toHaveBeenCalledWith(
          PATCH_KEY,
          true,
        );
      },
    );

    it("does not record completion when an update throws", async () => {
      mocked.collabService.commandApi.updateLineActions.mockRejectedValue(
        new Error("Command failed."),
      );
      const { projectService, repository } = await openProjectWith(
        createLegacyResetState(),
      );

      await expect(projectService.ensureRepository()).resolves.toBe(repository);
      expect(console.warn).toHaveBeenCalledWith(
        "Could not migrate reset actions to section transitions.",
        expect.objectContaining({ message: "Command failed." }),
      );

      expect(mocked.projectStore.app.set).not.toHaveBeenCalledWith(
        PATCH_KEY,
        true,
      );
    });

    it("continues after one rejection and retries only the remaining legacy item on the next open", async () => {
      const { commandApi } = mocked.collabService;
      let state = createLegacyResetState();
      const { projectService, repository } = await openProjectWith(state);
      repository.getState.mockImplementation(() => state);
      commandApi.updateLineActions.mockImplementation(
        async ({ lineId, data }) => {
          state = structuredClone(state);
          for (const scene of Object.values(state.scenes.items)) {
            for (const section of Object.values(scene.sections?.items ?? {})) {
              if (section.lines.items[lineId]) {
                section.lines.items[lineId].actions = data;
              }
            }
          }
          return { valid: true };
        },
      );
      commandApi.updateLayoutElement.mockImplementation(
        async ({ layoutId, elementId, data }) => {
          state = structuredClone(state);
          Object.assign(
            state.layouts.items[layoutId].elements.items[elementId],
            data,
          );
          return { valid: true };
        },
      );
      commandApi.updateLayoutElement.mockResolvedValueOnce({
        valid: false,
        error: { message: "Update rejected." },
      });
      commandApi.updateControlItem.mockImplementation(
        async ({ controlId, data }) => {
          state = structuredClone(state);
          Object.assign(state.controls.items[controlId], data);
          return { valid: true };
        },
      );
      commandApi.updateControlElement.mockImplementation(
        async ({ controlId, elementId, data }) => {
          state = structuredClone(state);
          Object.assign(
            state.controls.items[controlId].elements.items[elementId],
            data,
          );
          return { valid: true };
        },
      );

      await expect(projectService.ensureRepository()).resolves.toBe(repository);

      expect(commandApi.updateLineActions).toHaveBeenCalledTimes(2);
      expect(commandApi.updateLayoutElement).toHaveBeenCalledOnce();
      expect(commandApi.updateControlItem).toHaveBeenCalledOnce();
      expect(commandApi.updateControlElement).toHaveBeenCalledOnce();
      expect(mocked.projectStore.app.set).not.toHaveBeenCalledWith(
        PATCH_KEY,
        true,
      );
      expect(console.warn).toHaveBeenCalledOnce();
      for (const update of [
        commandApi.updateLineActions,
        commandApi.updateLayoutElement,
        commandApi.updateControlItem,
        commandApi.updateControlElement,
      ]) {
        update.mockClear();
      }

      // A reopened repository has a fresh identity and the commands accepted on the first open.
      const reopenedRepository = { getState: vi.fn(() => state) };
      mocked.repositoryService.ensureRepository.mockResolvedValue(
        reopenedRepository,
      );
      await expect(projectService.ensureRepository()).resolves.toBe(
        reopenedRepository,
      );

      expect(commandApi.updateLineActions).not.toHaveBeenCalled();
      expect(commandApi.updateControlItem).not.toHaveBeenCalled();
      expect(commandApi.updateControlElement).not.toHaveBeenCalled();
      expect(commandApi.updateLayoutElement).toHaveBeenCalledExactlyOnceWith({
        layoutId: "layout-1",
        elementId: "element-1",
        data: {
          click: {
            payload: {
              actions: {
                showConfirmDialog: {
                  resourceId: "layout-2",
                  confirmActions: {
                    popOverlay: {},
                    sectionTransition: {
                      sceneId: "scene-1",
                      sectionId: "section-1",
                      resetStory: true,
                    },
                  },
                },
              },
            },
          },
        },
        replace: false,
      });
      expect(mocked.projectStore.app.set).toHaveBeenCalledExactlyOnceWith(
        PATCH_KEY,
        true,
      );
      expect(console.warn).toHaveBeenCalledOnce();
    });

    it("rewrites the current actions and skips an item whose reset was removed during an earlier update", async () => {
      const { commandApi } = mocked.collabService;
      const snapshot = createLegacyResetState();
      const current = structuredClone(snapshot);
      const currentLine =
        current.scenes.items["scene-2"].sections.items["section-2"].lines.items[
          "line-3"
        ];
      currentLine.actions.dialogue = {
        content: [{ text: "Edited while opening" }],
      };
      currentLine.actions.playSound = { resourceId: "sound-1" };
      current.layouts.items["layout-1"].elements.items["element-1"].click = {
        payload: { actions: { nextLine: {} } },
      };
      const { projectService, repository } = await openProjectWith(snapshot);
      commandApi.updateLineActions.mockImplementationOnce(async () => {
        repository.getState.mockReturnValue(current);
        return { valid: true };
      });

      await projectService.ensureRepository();

      expect(commandApi.updateLineActions).toHaveBeenNthCalledWith(2, {
        lineId: "line-3",
        data: {
          background: { resourceId: "image-1" },
          dialogue: { content: [{ text: "Edited while opening" }] },
          playSound: { resourceId: "sound-1" },
          sectionTransition: {
            sceneId: "scene-1",
            sectionId: "section-1",
            resetStory: true,
            screen: { animations: { resourceId: "animation-1" } },
          },
        },
        replace: true,
      });
      expect(commandApi.updateLayoutElement).not.toHaveBeenCalled();
      expect(snapshot).toEqual(createLegacyResetState());
      expect(mocked.projectStore.app.set).toHaveBeenCalledWith(PATCH_KEY, true);
    });

    it("skips a line whose containing section was deleted after the snapshot", async () => {
      const { commandApi } = mocked.collabService;
      const state = createLegacyResetState();
      const current = structuredClone(state);
      delete current.scenes.items["scene-2"].sections.items["section-2"];
      const { projectService, repository } = await openProjectWith(state);
      commandApi.updateLineActions.mockImplementationOnce(async () => {
        repository.getState.mockReturnValue(current);
        return { valid: true };
      });

      await projectService.ensureRepository();

      expect(commandApi.updateLineActions).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ lineId: "line-2" }),
      );
      expect(commandApi.updateControlElement).not.toHaveBeenCalled();
      expect(mocked.projectStore.app.set).toHaveBeenCalledWith(PATCH_KEY, true);
    });

    it("skips a reset whose destination section was deleted after the snapshot", async () => {
      const { commandApi } = mocked.collabService;
      const state = createLegacyResetState();
      const current = structuredClone(state);
      delete current.scenes.items["scene-1"].sections.items["section-1"];
      const { projectService, repository } = await openProjectWith(state);
      commandApi.updateLineActions.mockImplementationOnce(async () => {
        repository.getState.mockReturnValue(current);
        return { valid: true };
      });

      await projectService.ensureRepository();

      expect(commandApi.updateLineActions).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ lineId: "line-2" }),
      );
      expect(commandApi.updateLayoutElement).not.toHaveBeenCalled();
      expect(commandApi.updateControlItem).not.toHaveBeenCalled();
      expect(mocked.projectStore.app.set).toHaveBeenCalledWith(PATCH_KEY, true);
    });

    it("submits keyboard and keyup resets as separate control updates", async () => {
      const { commandApi } = mocked.collabService;
      const state = createLegacyResetState();
      state.controls.items["control-1"].keyup.ctrl.payload.actions = {
        stopSkipMode: {},
        resetStoryAtSection: { sectionId: "section-2" },
      };
      const { projectService } = await openProjectWith(state);

      await projectService.ensureRepository();

      expect(commandApi.updateControlItem).toHaveBeenCalledTimes(2);
      expect(
        Object.keys(commandApi.updateControlItem.mock.calls[0][0].data),
      ).toEqual(["keyboard"]);
      expect(commandApi.updateControlItem).toHaveBeenNthCalledWith(2, {
        controlId: "control-1",
        data: {
          keyup: {
            ctrl: {
              payload: {
                actions: {
                  stopSkipMode: {},
                  sectionTransition: {
                    sceneId: "scene-2",
                    sectionId: "section-2",
                    resetStory: true,
                  },
                },
              },
            },
          },
        },
      });
    });

    it("rewrites resets in element conditional overrides without changing other override values", async () => {
      const { commandApi } = mocked.collabService;
      const state = createLegacyResetState();
      state.layouts.items["layout-1"].elements.items[
        "element-2"
      ].conditionalOverrides = [
        {
          when: { target: "variables.flag", op: "eq", value: true },
          set: {
            text: "Conditional",
            click: {
              payload: {
                actions: {
                  resetStoryAtSection: { sectionId: "section-2" },
                },
              },
            },
          },
        },
      ];
      const { projectService } = await openProjectWith(state);

      await projectService.ensureRepository();

      expect(commandApi.updateLayoutElement).toHaveBeenNthCalledWith(2, {
        layoutId: "layout-1",
        elementId: "element-2",
        replace: false,
        data: {
          conditionalOverrides: [
            {
              when: { target: "variables.flag", op: "eq", value: true },
              set: {
                text: "Conditional",
                click: {
                  payload: {
                    actions: {
                      sectionTransition: {
                        sceneId: "scene-2",
                        sectionId: "section-2",
                        resetStory: true,
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      });
    });

    it.each(["dialogue", "choice"])(
      "rewrites resets inside %s item actions on a line",
      async (actionType) => {
        const { commandApi } = mocked.collabService;
        const state = createLegacyResetState();
        const lines =
          state.scenes.items["scene-1"].sections.items["section-1"].lines.items;
        lines["line-1"].actions = {
          [actionType]: {
            items: [
              {
                id: "item-1",
                content: [{ text: "Option One" }],
                actions: { resetStoryAtSection: { sectionId: "section-2" } },
              },
            ],
          },
        };
        const { projectService } = await openProjectWith(state);

        await projectService.ensureRepository();

        expect(commandApi.updateLineActions).toHaveBeenNthCalledWith(1, {
          lineId: "line-1",
          replace: true,
          data: {
            [actionType]: {
              items: [
                {
                  id: "item-1",
                  content: [{ text: "Option One" }],
                  actions: {
                    sectionTransition: {
                      sceneId: "scene-2",
                      sectionId: "section-2",
                      resetStory: true,
                    },
                  },
                },
              ],
            },
          },
        });
      },
    );

    it("waits for the platform to mark a synchronized project ready", async () => {
      const { commandApi } = mocked.collabService;
      const { projectService } = await openProjectWith(
        createLegacyResetState(),
        { shouldApplyProjectContentPatchesOnEnsure: () => false },
      );

      await projectService.ensureRepository();

      expect(commandApi.updateLineActions).not.toHaveBeenCalled();
      expect(mocked.projectStore.app.set).not.toHaveBeenCalled();

      await projectService.ensureProjectContentPatches();

      expect(commandApi.updateLineActions).toHaveBeenCalledTimes(2);
      expect(mocked.projectStore.app.set).toHaveBeenCalledWith(PATCH_KEY, true);
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
      loadSceneTextStats: vi.fn(async () => ({})),
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

  describe("repairSoundFileType", () => {
    const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0]);
    let state;
    let revoke;

    beforeEach(() => {
      state = {
        sounds: { items: { "sound-1": { name: "Theme", fileId: "file-1" } } },
        files: {
          items: {
            "file-1": { id: "file-1", mimeType: "application/octet-stream" },
          },
        },
      };
      revoke = vi.fn();
      mocked.repositoryService.getCachedRepository.mockReturnValue({
        getState: () => state,
      });
      mocked.assetService.getFileContent.mockResolvedValue({
        url: "blob:sound-1",
        revoke,
      });
      mocked.fetch.mockResolvedValue({
        ok: true,
        blob: async () => new Blob([oggBytes]),
      });
      mocked.assetService.storeFile.mockResolvedValue({
        fileId: "file-2",
        fileRecords: [{ id: "file-2", mimeType: "audio/ogg" }],
      });
      mocked.collabService.commandApi.updateSound.mockResolvedValue({
        valid: true,
      });
    });

    it("stores the sound bytes with the detected type and points the sound at them", async () => {
      const service = createTestProjectService();

      await expect(
        service.repairSoundFileType({ soundId: "sound-1" }),
      ).resolves.toBe(true);

      const [{ file }] = mocked.assetService.storeFile.mock.calls[0];
      expect(file.type).toBe("audio/ogg");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(oggBytes);
      expect(mocked.collabService.commandApi.updateSound).toHaveBeenCalledWith({
        soundId: "sound-1",
        data: { fileId: "file-2" },
        fileRecords: [{ id: "file-2", mimeType: "audio/ogg" }],
      });
      expect(revoke).toHaveBeenCalledOnce();
    });

    it("skips sounds whose file record already has a specific type", async () => {
      state.files.items["file-1"].mimeType = "audio/ogg";
      const service = createTestProjectService();

      await expect(
        service.repairSoundFileType({ soundId: "sound-1" }),
      ).resolves.toBe(false);
      expect(mocked.assetService.getFileContent).not.toHaveBeenCalled();
    });

    it("does not overwrite a sound whose file changed while its bytes were copied", async () => {
      mocked.assetService.storeFile.mockImplementation(async () => {
        state.sounds.items["sound-1"].fileId = "file-3";
        return { fileId: "file-2", fileRecords: [{ id: "file-2" }] };
      });
      const service = createTestProjectService();

      await expect(
        service.repairSoundFileType({ soundId: "sound-1" }),
      ).resolves.toBe(false);
      expect(
        mocked.collabService.commandApi.updateSound,
      ).not.toHaveBeenCalled();
    });

    it("rejects when the sound update is not accepted", async () => {
      mocked.collabService.commandApi.updateSound.mockResolvedValue({
        valid: false,
        error: { message: "Sound not found." },
      });
      const service = createTestProjectService();

      await expect(
        service.repairSoundFileType({ soundId: "sound-1" }),
      ).rejects.toThrow("Sound not found.");
    });

    it("revokes the file URL and rejects when the file cannot be read", async () => {
      mocked.fetch.mockResolvedValue({ ok: false, status: 404 });
      const service = createTestProjectService();

      await expect(
        service.repairSoundFileType({ soundId: "sound-1" }),
      ).rejects.toThrow("HTTP 404");
      expect(revoke).toHaveBeenCalledOnce();
      expect(mocked.assetService.storeFile).not.toHaveBeenCalled();
    });

    it("ignores repeated requests while a sound is being repaired", async () => {
      const service = createTestProjectService();

      const results = await Promise.all([
        service.repairSoundFileType({ soundId: "sound-1" }),
        service.repairSoundFileType({ soundId: "sound-1" }),
      ]);

      expect(results).toEqual([true, false]);
      expect(mocked.assetService.storeFile).toHaveBeenCalledOnce();
    });
  });
});
