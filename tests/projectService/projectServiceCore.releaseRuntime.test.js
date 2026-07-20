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
    mocked.collabService.commandApi.deleteSceneItem.mockReset();
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
});
