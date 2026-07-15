import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleDownloadMacosApplicationClick,
  handleDownloadWindowsExecutableClick,
  handleDownloadWindowsInstallerClick,
  handleDownloadZipClick,
  handleMobileDetailSheetClose,
  handleVersionFormAction,
} from "../../src/pages/versions/versions.handlers.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";

const createTreeCollection = (items = {}, tree = []) => ({
  items,
  tree,
});

const createDeps = ({ repository, version, editingVersionId } = {}) => {
  const selectedVersion = version || {
    id: "version-1",
    name: "Version 1",
    actionIndex: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const progressDialog = {
    close: vi.fn(),
    update: vi.fn(),
  };

  return {
    appService: {
      getPayload: vi.fn(() => ({ p: "project-1" })),
      getCurrentProjectEntry: vi.fn(() => ({
        id: "project-1",
        name: "Project One",
      })),
      getAppVersion: vi.fn(() => "1.0.0"),
      showAlert: vi.fn(),
      showProgressDialog: vi.fn(() => progressDialog),
      closeAll: vi.fn(),
    },
    projectService: {
      ensureRepository: vi.fn(async () => repository),
      getRepository: vi.fn(async () => repository),
      getRepositoryRevision: vi.fn(() => repository?.getRevision?.()),
      loadRepositoryState: vi.fn(async (actionIndex) =>
        repository?.loadState?.(actionIndex),
      ),
      addVersionToProject: vi.fn(async () => {}),
      getCurrentProjectInfo: vi.fn(async () => ({
        namespace: "project-one",
        nativeApplicationIdentifier: "vn.routevn.player.project-one",
        name: "Project One",
        iconFileId: "icon-1",
        publisher: "Studio One",
      })),
      promptDistributionZipPath: vi.fn(async () => undefined),
      createDistributionZipStreamedToPath: vi.fn(async () => "/tmp/export.zip"),
      createDistributionZipStreamed: vi.fn(async () => "/tmp/export.zip"),
      promptWindowsExecutablePath: vi.fn(async () => "/tmp/export.exe"),
      promptWindowsInstallerPath: vi.fn(async () => "/tmp/export-setup.exe"),
      promptMacosApplicationPath: vi.fn(async () => "/tmp/export.app.zip"),
      getMacosExportAvailability: vi.fn(async () => ({
        application: true,
        templateAvailable: true,
        hostSupported: true,
        dittoAvailable: true,
        codesignAvailable: true,
        sipsAvailable: true,
        iconutilAvailable: true,
        lipoAvailable: true,
      })),
      createWindowsPortableExecutableToPath: vi.fn(async () => ({
        outputPath: "/tmp/export.exe",
      })),
      createWindowsInstallerToPath: vi.fn(async () => ({
        outputPath: "/tmp/export-setup.exe",
      })),
      createMacosApplicationToPath: vi.fn(async () => ({
        outputPath: "/tmp/export.app.zip",
      })),
    },
    store: {
      selectEditingVersionId: vi.fn(() => editingVersionId),
      selectVersion: vi.fn((versionId) =>
        versionId === selectedVersion.id ? selectedVersion : undefined,
      ),
      addVersion: vi.fn(),
      updateVersion: vi.fn(),
      setSelectedItemId: vi.fn(),
      closeVersionDialog: vi.fn(),
      closeDropdownMenu: vi.fn(),
    },
    progressDialog,
    render: vi.fn(),
  };
};

const createVersionClickPayload = (versionId = "version-1") => ({
  _event: {
    stopPropagation: vi.fn(),
    currentTarget: {
      dataset: {
        versionId,
      },
    },
  },
});

describe("versions lifecycle", () => {
  it("syncs touch UI config before mount", () => {
    const setUiConfig = vi.fn();
    const deps = {
      appService: {
        getPlatform: vi.fn(() => "web"),
      },
      store: {
        setUiConfig,
        setPlatform: vi.fn(),
        setVisualTestMode: vi.fn(),
      },
      uiConfig: {
        id: "touch",
        inputMode: "touch",
      },
    };

    handleBeforeMount(deps);

    expect(setUiConfig).toHaveBeenCalledWith({
      uiConfig: deps.uiConfig,
    });
    expect(deps.store.setPlatform).toHaveBeenCalledWith({ platform: "web" });
    expect(deps.store.setVisualTestMode).toHaveBeenCalledWith({
      enabled: false,
    });
  });
});

describe("versions.handleVersionFormAction", () => {
  it("uses repository revision to create a version without loading full history", async () => {
    const repository = {
      getRevision: vi.fn(() => 7),
      loadEvents: vi.fn(async () => []),
      getEvents: vi.fn(() => []),
    };
    const deps = createDeps({
      repository,
    });

    await handleVersionFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Checkpoint 7",
            description: "notes",
          },
        },
      },
    });

    expect(deps.projectService.ensureRepository).toHaveBeenCalledTimes(1);
    expect(deps.projectService.getRepositoryRevision).toHaveBeenCalledTimes(1);
    expect(repository.loadEvents).not.toHaveBeenCalled();
    expect(deps.projectService.addVersionToProject).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        name: "Checkpoint 7",
        notes: "notes",
        actionIndex: 7,
      }),
    );
    expect(deps.store.closeVersionDialog).toHaveBeenCalled();
  });
});

describe("versions.handleMobileDetailSheetClose", () => {
  it("clears the selected version when the mobile detail sheet closes", () => {
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "version-1"),
        setSelectedItemId: vi.fn(),
      },
      render: vi.fn(),
    };

    handleMobileDetailSheetClose(deps);

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
  });
});

describe("versions.handleDownloadZipClick", () => {
  it("uses repository.loadState when available instead of forcing full history load", async () => {
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({
      repository,
    });

    await handleDownloadZipClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: {
            versionId: "version-1",
          },
        },
      },
    });

    expect(deps.projectService.loadRepositoryState).toHaveBeenCalledWith(3);
    expect(repository.loadEvents).not.toHaveBeenCalled();
    expect(
      deps.projectService.createDistributionZipStreamed,
    ).toHaveBeenCalled();
  });

  it("passes file mime metadata into streamed ZIP export", async () => {
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.story = {
      initialSceneId: "scene-1",
    };
    repositoryState.files = createTreeCollection(
      {
        "file-1": {
          id: "file-1",
          mimeType: "image/png",
          size: 123,
          sha256: "hash-1",
        },
      },
      [{ id: "file-1" }],
    );
    repositoryState.images = createTreeCollection(
      {
        "image-1": {
          id: "image-1",
          type: "image",
          fileId: "file-1",
        },
      },
      [{ id: "image-1" }],
    );
    repositoryState.scenes = createTreeCollection(
      {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          name: "Scene 1",
          initialSectionId: "section-1",
          sections: createTreeCollection(
            {
              "section-1": {
                id: "section-1",
                type: "section",
                name: "Section 1",
                lines: createTreeCollection(
                  {
                    "line-1": {
                      id: "line-1",
                      actions: {
                        background: {
                          resourceId: "image-1",
                          resourceType: "image",
                        },
                      },
                    },
                  },
                  [{ id: "line-1" }],
                ),
              },
            },
            [{ id: "section-1" }],
          ),
        },
      },
      [{ id: "scene-1" }],
    );

    const repository = {
      loadState: vi.fn(async () => repositoryState),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => repositoryState),
    };
    const deps = createDeps({
      repository,
    });

    await handleDownloadZipClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: {
            versionId: "version-1",
          },
        },
      },
    });

    expect(
      deps.projectService.createDistributionZipStreamed,
    ).toHaveBeenCalled();
    expect(
      deps.projectService.createDistributionZipStreamed.mock.calls[0][0]
        .bundleMetadata.project,
    ).toMatchObject({
      namespace: "project-one",
      title: "Project One",
      iconFileId: "icon-1",
    });
    expect(
      deps.projectService.createDistributionZipStreamed.mock.calls[0][1],
    ).toEqual([
      { fileId: "file-1", mimeType: "image/png" },
      { fileId: "icon-1", mimeType: "image/png" },
    ]);
  });

  it("drops invalid font mime metadata before export", async () => {
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.story.initialSceneId = "scene-1";
    repositoryState.files = createTreeCollection(
      {
        "file-font-1": {
          id: "file-font-1",
          type: "font",
          mimeType: "font/sample_font",
          size: 857712,
          sha256: "font-hash-1",
        },
      },
      [{ id: "file-font-1" }],
    );
    repositoryState.fonts = createTreeCollection(
      {
        "font-1": {
          id: "font-1",
          type: "font",
          fileId: "file-font-1",
        },
      },
      [{ id: "font-1" }],
    );
    repositoryState.textStyles = createTreeCollection(
      {
        "text-style-1": {
          id: "text-style-1",
          type: "textStyle",
          fontId: "font-1",
        },
      },
      [{ id: "text-style-1" }],
    );
    repositoryState.layouts = createTreeCollection(
      {
        "layout-1": {
          id: "layout-1",
          type: "layout",
          layoutType: "normal",
          elements: createTreeCollection(
            {
              "text-1": {
                id: "text-1",
                type: "text",
                textStyleId: "text-style-1",
              },
            },
            [{ id: "text-1" }],
          ),
        },
      },
      [{ id: "layout-1" }],
    );
    repositoryState.scenes = createTreeCollection(
      {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          name: "Scene 1",
          initialSectionId: "section-1",
          sections: createTreeCollection(
            {
              "section-1": {
                id: "section-1",
                type: "section",
                name: "Section 1",
                lines: createTreeCollection(
                  {
                    "line-1": {
                      id: "line-1",
                      actions: {
                        dialogue: {
                          ui: {
                            resourceId: "layout-1",
                          },
                        },
                      },
                    },
                  },
                  [{ id: "line-1" }],
                ),
              },
            },
            [{ id: "section-1" }],
          ),
        },
      },
      [{ id: "scene-1" }],
    );

    const repository = {
      loadState: vi.fn(async () => repositoryState),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => repositoryState),
    };
    const deps = createDeps({
      repository,
    });

    await handleDownloadZipClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: {
            versionId: "version-1",
          },
        },
      },
    });

    expect(
      deps.projectService.createDistributionZipStreamed,
    ).toHaveBeenCalled();
    expect(
      deps.projectService.createDistributionZipStreamed.mock.calls[0][1],
    ).toEqual([
      { fileId: "file-font-1" },
      { fileId: "icon-1", mimeType: "image/png" },
    ]);
  });
});

describe("versions Windows export handlers", () => {
  it("uses a numeric Windows file version instead of the release display name for EXE export", async () => {
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({
      repository,
      version: {
        id: "version-1",
        name: "Version 1",
        actionIndex: 3,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    await handleDownloadWindowsExecutableClick(
      deps,
      createVersionClickPayload(),
    );

    expect(
      deps.projectService.createWindowsPortableExecutableToPath,
    ).toHaveBeenCalled();
    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      message: "Please wait while the Windows executable is being created...",
      status: "Creating executable...",
      title: "Windows export in progress",
    });
    expect(deps.progressDialog.close).toHaveBeenCalledTimes(1);
    expect(
      deps.projectService.createWindowsPortableExecutableToPath.mock
        .calls[0][3],
    ).toMatchObject({
      title: "Project One",
      version: "1.0.0.3",
      publisher: "Studio One",
      iconFileId: "icon-1",
    });
  });

  it("uses a numeric Windows file version instead of the release display name for installer export", async () => {
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({
      repository,
      version: {
        id: "version-1",
        name: "Version 1",
        actionIndex: 65536,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    await handleDownloadWindowsInstallerClick(
      deps,
      createVersionClickPayload(),
    );

    expect(deps.projectService.createWindowsInstallerToPath).toHaveBeenCalled();
    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      message: "Please wait while the Windows installer is being created...",
      status: "Creating installer...",
      title: "Windows installer export",
    });
    expect(deps.progressDialog.close).toHaveBeenCalledTimes(1);
    expect(
      deps.projectService.createWindowsInstallerToPath.mock.calls[0][3],
    ).toMatchObject({
      title: "Project One",
      version: "1.0.1.0",
      publisher: "Studio One",
      iconFileId: "icon-1",
    });
  });

  it("stops before opening the save dialog when Windows file version data is missing", async () => {
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({
      repository,
      version: {
        id: "version-1",
        name: "Version 1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    });

    await handleDownloadWindowsExecutableClick(
      deps,
      createVersionClickPayload(),
    );

    expect(
      deps.projectService.promptWindowsExecutablePath,
    ).not.toHaveBeenCalled();
    expect(
      deps.projectService.createWindowsPortableExecutableToPath,
    ).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          "Windows export requires a valid non-negative release action index.",
        ),
      }),
    );
  });

  it("shows and logs string errors from Windows EXE export", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({
      repository,
    });
    deps.projectService.createWindowsPortableExecutableToPath = vi.fn(
      async () => {
        throw "native export failed";
      },
    );

    try {
      await handleDownloadWindowsExecutableClick(
        deps,
        createVersionClickPayload(),
      );

      expect(deps.appService.showAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("native export failed"),
        }),
      );
      expect(consoleError).toHaveBeenCalledWith(
        "Version Windows executable export failed",
        expect.objectContaining({
          error: "native export failed",
          errorMessage: "native export failed",
          outputPath: "/tmp/export.exe",
          versionActionIndex: 3,
          versionId: "version-1",
          versionName: "Version 1",
          windowsFileVersion: "1.0.0.3",
        }),
      );
      expect(deps.progressDialog.close).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("explains missing native Windows EXE export command errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({
      repository,
    });
    deps.projectService.createWindowsPortableExecutableToPath = vi.fn(
      async () => {
        throw "Command export_windows_portable_executable not found";
      },
    );

    try {
      await handleDownloadWindowsExecutableClick(
        deps,
        createVersionClickPayload(),
      );

      expect(deps.appService.showAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            "Restart the Tauri dev process so the native shell rebuilds.",
          ),
        }),
      );
      expect(consoleError).toHaveBeenCalledWith(
        "Version Windows executable export failed",
        expect.objectContaining({
          errorMessage: expect.stringContaining(
            "Restart the Tauri dev process so the native shell rebuilds.",
          ),
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("versions macOS export handlers", () => {
  it("reports template inspection errors instead of claiming the template is absent", async () => {
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({ repository });
    deps.projectService.getMacosExportAvailability.mockResolvedValue({
      application: false,
      templateAvailable: false,
      templateCheckError: "forbidden path: /resources/player-templates/macos",
      hostSupported: true,
    });

    await handleDownloadMacosApplicationClick(
      deps,
      createVersionClickPayload(),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          "Unable to verify the bundled macOS player template: forbidden path",
        ),
      }),
    );
    expect(
      deps.projectService.promptMacosApplicationPath,
    ).not.toHaveBeenCalled();
  });

  it("explains a stale native shell instead of opening the save dialog", async () => {
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({ repository });
    deps.projectService.getMacosExportAvailability.mockResolvedValue({
      application: false,
      templateAvailable: true,
      hostSupported: true,
      capabilityCheckError:
        "Command get_macos_export_host_capabilities not found",
    });

    await handleDownloadMacosApplicationClick(
      deps,
      createVersionClickPayload(),
    );

    expect(deps.appService.showAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          "Restart the Tauri dev process so the native shell rebuilds.",
        ),
      }),
    );
    expect(
      deps.projectService.promptMacosApplicationPath,
    ).not.toHaveBeenCalled();
  });

  it("uses the release action index for bundle versions and the stable project identity", async () => {
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({ repository });

    await handleDownloadMacosApplicationClick(
      deps,
      createVersionClickPayload(),
    );

    expect(deps.projectService.createMacosApplicationToPath).toHaveBeenCalled();
    expect(deps.appService.showProgressDialog).toHaveBeenCalledWith({
      message: "Please wait while the macOS application is being created...",
      status: "Creating application...",
      title: "macOS export in progress",
    });
    expect(deps.progressDialog.close).toHaveBeenCalledTimes(1);
    expect(
      deps.projectService.createMacosApplicationToPath.mock.calls[0][3],
    ).toEqual({
      title: "Project One",
      shortVersion: "1.0.3",
      bundleVersion: "4",
      applicationIdentifier: "vn.routevn.player.project-one",
      iconFileId: "icon-1",
    });
  });
});
