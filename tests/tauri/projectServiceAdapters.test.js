import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  exists: vi.fn(),
  join: vi.fn(),
  mkdir: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
  readFile: vi.fn(),
  resolveResource: vi.fn(),
  convertFileSrc: vi.fn((value) => value),
  invoke: vi.fn(async () => {}),
  connection: {
    init: vi.fn(async () => {}),
    select: vi.fn(async () => []),
    execute: vi.fn(async () => {}),
  },
  getManagedSqliteConnection: vi.fn(),
  createPersistedTauriProjectStore: vi.fn(),
  loadTemplate: vi.fn(),
  getTemplateFiles: vi.fn(async () => []),
  resolveProjectResolutionForWrite: vi.fn(),
  scaleTemplateProjectStateForResolution: vi.fn(),
  createProjectCreateRepositoryEvent: vi.fn(),
  createProjectCollabService: vi.fn(),
  createWebSocketTransport: vi.fn(),
  applyCommandToRepository: vi.fn(),
  commandToSyncEvent: vi.fn(),
  fileTypeFromBuffer: vi.fn(),
  getImageDimensions: vi.fn(),
}));

vi.mock("file-type", () => ({
  fileTypeFromBuffer: mocked.fileTypeFromBuffer,
}));

vi.mock("../../src/deps/clients/web/fileProcessors.js", () => ({
  getImageDimensions: mocked.getImageDimensions,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: mocked.mkdir,
  writeFile: mocked.writeFile,
  readFile: mocked.readFile,
  exists: mocked.exists,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
  resolveResource: mocked.resolveResource,
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: mocked.convertFileSrc,
  invoke: mocked.invoke,
}));

vi.mock("../../src/deps/clients/tauri/sqliteConnectionManager.js", () => ({
  getManagedSqliteConnection: mocked.getManagedSqliteConnection,
}));

vi.mock("../../src/deps/services/tauri/collabClientStore.js", () => ({
  PROJECT_DB_NAME: "project.db",
  createPersistedTauriProjectStore: mocked.createPersistedTauriProjectStore,
  evictPersistedTauriProjectStoreCache: vi.fn(async () => {}),
}));

vi.mock(
  "../../src/deps/services/shared/collab/createProjectCollabService.js",
  () => ({
    createProjectCollabService: mocked.createProjectCollabService,
  }),
);

vi.mock(
  "../../src/deps/services/web/collab/createWebSocketTransport.js",
  () => ({
    createWebSocketTransport: mocked.createWebSocketTransport,
  }),
);

vi.mock("../../src/deps/services/shared/collab/mappers.js", () => ({
  commandToSyncEvent: mocked.commandToSyncEvent,
}));

vi.mock("../../src/deps/services/shared/projectRepository.js", async () => {
  const actual = await vi.importActual(
    "../../src/deps/services/shared/projectRepository.js",
  );

  return {
    ...actual,
    applyCommandToRepository: mocked.applyCommandToRepository,
    assertSupportedProjectState: vi.fn(),
    createProjectCreateRepositoryEvent:
      mocked.createProjectCreateRepositoryEvent,
  };
});

vi.mock("../../src/deps/clients/web/templateLoader.js", () => ({
  loadTemplate: mocked.loadTemplate,
  getTemplateFiles: mocked.getTemplateFiles,
}));

vi.mock("../../src/internal/projectResolution.js", () => ({
  DEFAULT_PROJECT_RESOLUTION: {
    width: 1280,
    height: 720,
  },
  requireProjectResolution: vi.fn(),
  resolveProjectResolutionForWrite: mocked.resolveProjectResolutionForWrite,
  scaleTemplateProjectStateForResolution:
    mocked.scaleTemplateProjectStateForResolution,
}));

import { createTauriProjectServiceAdapters } from "../../src/deps/services/tauri/projectServiceAdapters.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";
import { expectInitializedProjectStorageContract } from "../support/projectInitializationContract.js";

const createSessionMock = () => ({
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  submitEvent: vi.fn(async () => {}),
  syncNow: vi.fn(async () => {}),
  flushDrafts: vi.fn(async () => {}),
  setOnlineTransport: vi.fn(async () => {}),
  getActor: vi.fn(() => ({
    userId: "user-1",
    clientId: "client-1",
  })),
});

const createMacosApplicationExportOptions = (overrides = {}) => {
  const options = {
    projectData: {},
    fileEntries: [],
    outputPath: "/exports/Game.app.zip",
    title: "Game",
    shortVersion: "1.0.3",
    bundleVersion: "4",
    applicationIdentifier: "vn.routevn.player.game",
    iconFileId: "icon-1",
    getCurrentReference: () => ({
      projectPath: "/projects/demo",
      cacheKey: "/projects/demo",
    }),
  };
  Object.assign(options, overrides);
  return options;
};

const createRemoteSceneCreateCommand = ({ schemaVersion = 1 } = {}) => ({
  id: "cmd-scene-1",
  partition: "m",
  projectId: "project-1",
  actor: {
    userId: "user-2",
    clientId: "client-2",
  },
  clientTs: 1,
  schemaVersion,
  type: "scene.create",
  payload: {
    sceneId: "scene-1",
    data: {
      name: "Scene 1",
    },
  },
});

describe("tauri project service adapters preflight reads", () => {
  beforeEach(() => {
    mocked.exists.mockReset();
    mocked.join.mockReset();
    mocked.mkdir.mockClear();
    mocked.writeFile.mockClear();
    mocked.readFile.mockReset();
    mocked.resolveResource.mockReset();
    mocked.convertFileSrc.mockClear();
    mocked.invoke.mockReset();
    mocked.connection.init.mockClear();
    mocked.connection.select.mockReset();
    mocked.connection.execute.mockReset();
    mocked.getManagedSqliteConnection.mockReset();
    mocked.createPersistedTauriProjectStore.mockReset();
    mocked.loadTemplate.mockReset();
    mocked.getTemplateFiles.mockReset();
    mocked.resolveProjectResolutionForWrite.mockReset();
    mocked.scaleTemplateProjectStateForResolution.mockReset();
    mocked.createProjectCreateRepositoryEvent.mockReset();
    mocked.createProjectCollabService.mockReset();
    mocked.createWebSocketTransport.mockReset();
    mocked.applyCommandToRepository.mockReset();
    mocked.commandToSyncEvent.mockReset();
    mocked.fileTypeFromBuffer.mockReset();
    mocked.getImageDimensions.mockReset();

    mocked.join.mockImplementation(async (...parts) => parts.join("/"));
    mocked.getManagedSqliteConnection.mockReturnValue(mocked.connection);
    mocked.getTemplateFiles.mockResolvedValue([]);
    mocked.invoke.mockResolvedValue(undefined);
    mocked.fileTypeFromBuffer.mockResolvedValue({
      ext: "png",
      mime: "image/png",
    });
    mocked.getImageDimensions.mockResolvedValue({ width: 512, height: 512 });
    mocked.createWebSocketTransport.mockReturnValue({
      kind: "transport",
    });
    mocked.commandToSyncEvent.mockImplementation((command) => ({
      id: command?.id,
      partition: command?.partition,
      projectId: command?.projectId,
      type: command?.type,
      schemaVersion: command?.schemaVersion,
      payload: structuredClone(command?.payload),
      clientTs: command?.clientTs,
      meta: structuredClone(command?.meta ?? {}),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects invalid project file ids before resolving tauri file paths", async () => {
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      fileAdapter.getFileContent({
        fileId: "../project.db",
        getCurrentReference: () => ({
          projectPath: "/projects/project-two",
          cacheKey: "/projects/project-two",
        }),
      }),
    ).rejects.toThrow("Project file id is invalid.");

    expect(mocked.join).not.toHaveBeenCalled();
  });

  it("serves video file content through the project media server when available", async () => {
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
      projectMediaOrigin: "http://127.0.0.1:42123",
    });

    const result = await fileAdapter.getFileContent({
      fileId: "video-1",
      fileMetadata: { mimeType: "video/mp4" },
      getCurrentReference: () => ({
        projectPath: "/projects/project-two",
        cacheKey: "/projects/project-two",
      }),
    });

    expect(result).toEqual({
      url: "http://127.0.0.1:42123/file.mp4?path=%2Fprojects%2Fproject-two%2Ffiles%2Fvideo-1",
      type: "video/mp4",
    });
    expect(mocked.convertFileSrc).not.toHaveBeenCalled();
  });

  it("continues to serve non-video file content through Tauri asset URLs", async () => {
    mocked.convertFileSrc.mockImplementation((filePath) => {
      return `asset://localhost/${encodeURIComponent(filePath)}`;
    });
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
      projectMediaOrigin: "http://127.0.0.1:42123",
    });

    const result = await fileAdapter.getFileContent({
      fileId: "image-1",
      fileMetadata: { mimeType: "image/png" },
      getCurrentReference: () => ({
        projectPath: "/projects/project-two",
        cacheKey: "/projects/project-two",
      }),
    });

    expect(result).toEqual({
      url: "asset://localhost/%2Fprojects%2Fproject-two%2Ffiles%2Fimage-1",
    });
    expect(mocked.convertFileSrc).toHaveBeenCalledWith(
      "/projects/project-two/files/image-1",
    );
  });

  it("passes repository mime metadata into streamed native ZIP export", async () => {
    mocked.exists.mockResolvedValue(true);
    mocked.invoke.mockResolvedValue({
      assetCount: 1,
      rawAssetBytes: 1,
      storedChunkBytes: 1,
      packageBinBytes: 1,
      zipBytes: 1,
    });

    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      fileAdapter.createDistributionZipStreamedToPath({
        projectData: { bundleMetadata: { project: { namespace: "demo" } } },
        fileEntries: [{ fileId: "font-1", mimeType: "font/ttf" }],
        outputPath: "/exports/demo.zip",
        staticFiles: {},
        getCurrentReference: () => ({
          projectPath: "/projects/demo",
          cacheKey: "/projects/demo",
        }),
      }),
    ).resolves.toBe("/exports/demo.zip");

    expect(mocked.invoke).toHaveBeenCalledWith(
      "create_distribution_zip_streamed",
      expect.objectContaining({
        outputPath: "/exports/demo.zip",
        assets: [
          {
            id: "font-1",
            path: "/projects/demo/files/font-1",
            mime: "font/ttf",
          },
        ],
      }),
    );
  });

  it("preflights and invokes universal macOS application export", async () => {
    mocked.exists.mockResolvedValue(true);
    mocked.resolveResource.mockResolvedValue(
      "/resources/player-templates/macos/RouteVNPlayerTemplate.app.zip",
    );
    mocked.readFile.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    mocked.invoke.mockImplementation(async (command) => {
      if (command === "get_macos_export_host_capabilities") {
        return {
          hostSupported: true,
          dittoAvailable: true,
          codesignAvailable: true,
          sipsAvailable: true,
          iconutilAvailable: true,
          lipoAvailable: true,
          available: true,
        };
      }
      if (command === "export_macos_application") {
        return {
          outputPath: "/exports/Game.app.zip",
          stats: { assetCount: 1 },
        };
      }
      return undefined;
    });
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      fileAdapter.getMacosExportAvailability(),
    ).resolves.toMatchObject({
      application: true,
      templateAvailable: true,
      hostSupported: true,
    });
    await expect(
      fileAdapter.createMacosApplicationToPath(
        createMacosApplicationExportOptions({
          projectData: { bundleMetadata: { project: { namespace: "demo" } } },
          fileEntries: [{ fileId: "image-1", mimeType: "image/png" }],
        }),
      ),
    ).resolves.toMatchObject({ outputPath: "/exports/Game.app.zip" });

    expect(mocked.invoke).toHaveBeenCalledWith(
      "export_macos_application",
      expect.objectContaining({
        templatePath:
          "/resources/player-templates/macos/RouteVNPlayerTemplate.app.zip",
        outputPath: "/exports/Game.app.zip",
        shortVersion: "1.0.3",
        bundleVersion: "4",
        applicationIdentifier: "vn.routevn.player.game",
        iconPng: [1, 2, 3],
        assets: [
          {
            id: "image-1",
            path: "/projects/demo/files/image-1",
            mime: "image/png",
          },
        ],
      }),
    );
  });

  it("rejects unsupported project icon bytes before macOS export", async () => {
    mocked.readFile.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    mocked.fileTypeFromBuffer.mockResolvedValue({
      ext: "gif",
      mime: "image/gif",
    });
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      fileAdapter.createMacosApplicationToPath(
        createMacosApplicationExportOptions(),
      ),
    ).rejects.toThrow(
      "Project icon must be a PNG, JPEG, or WebP image for macOS application export.",
    );

    expect(mocked.getImageDimensions).not.toHaveBeenCalled();
    expect(mocked.invoke).not.toHaveBeenCalledWith(
      "export_macos_application",
      expect.anything(),
    );
  });

  it("rejects non-square project icons before macOS export", async () => {
    mocked.readFile.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    mocked.getImageDimensions.mockResolvedValue({ width: 512, height: 256 });
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      fileAdapter.createMacosApplicationToPath(
        createMacosApplicationExportOptions(),
      ),
    ).rejects.toThrow(
      "Project icon must be square for macOS application export. Current size: 512x256.",
    );

    expect(mocked.invoke).not.toHaveBeenCalledWith(
      "export_macos_application",
      expect.anything(),
    );
  });

  it("rejects project icons that cannot be decoded before macOS export", async () => {
    mocked.readFile.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    mocked.getImageDimensions.mockResolvedValue(undefined);
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      fileAdapter.createMacosApplicationToPath(
        createMacosApplicationExportOptions(),
      ),
    ).rejects.toThrow(
      "Project icon could not be decoded for macOS application export.",
    );

    expect(mocked.invoke).not.toHaveBeenCalledWith(
      "export_macos_application",
      expect.anything(),
    );
  });

  it("keeps the macOS host visible when the running shell lacks preflight commands", async () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    mocked.exists.mockResolvedValue(true);
    mocked.resolveResource.mockResolvedValue(
      "/resources/player-templates/macos/RouteVNPlayerTemplate.app.zip",
    );
    mocked.invoke.mockRejectedValue(
      "Command get_macos_export_host_capabilities not found",
    );
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      fileAdapter.getMacosExportAvailability(),
    ).resolves.toMatchObject({
      application: false,
      templateAvailable: true,
      hostSupported: true,
      capabilityCheckError:
        "Command get_macos_export_host_capabilities not found",
    });
  });

  it("preserves macOS template inspection errors for user-facing diagnostics", async () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    mocked.resolveResource.mockResolvedValue(
      "/resources/player-templates/macos/RouteVNPlayerTemplate.app.zip",
    );
    mocked.exists.mockRejectedValue(
      "forbidden path: /resources/player-templates/macos/RouteVNPlayerTemplate.app.zip",
    );
    mocked.invoke.mockResolvedValue({
      hostSupported: true,
      available: true,
    });
    const { fileAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      fileAdapter.getMacosExportAvailability(),
    ).resolves.toMatchObject({
      application: false,
      templateAvailable: false,
      templateCheckError:
        "forbidden path: /resources/player-templates/macos/RouteVNPlayerTemplate.app.zip",
    });
  });

  it("reads creatorVersion from app_state without creating the project store", async () => {
    mocked.exists.mockResolvedValue(true);
    mocked.connection.select.mockResolvedValue([
      {
        value: "1",
      },
    ]);

    const { storageAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    const creatorVersion = await storageAdapter.readCreatorVersionByReference({
      reference: {
        projectPath: "/projects/project-two",
      },
    });

    expect(creatorVersion).toBe(1);
    expect(mocked.getManagedSqliteConnection).toHaveBeenCalledWith({
      dbPath: "sqlite:/projects/project-two/project.db",
      busyTimeoutMs: 15000,
    });
  });

  it("persists normalized project identity metadata by reference", async () => {
    mocked.exists.mockResolvedValue(true);
    const { storageAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await storageAdapter.writeProjectInfoByReference({
      reference: {
        projectPath: "/projects/project-one",
      },
      projectInfo: {
        id: "project-1",
        namespace: "project-one",
        nativeApplicationIdentifier: "vn.routevn.player.project-one",
        name: "Project One",
        language: "zh-hans",
      },
    });

    expect(mocked.connection.execute).toHaveBeenCalledWith(
      "INSERT OR REPLACE INTO app_state (key, value) VALUES ($1, $2)",
      [
        "projectInfo",
        JSON.stringify({
          id: "project-1",
          namespace: "project-one",
          nativeApplicationIdentifier: "vn.routevn.player.project-one",
          name: "Project One",
          description: "",
          language: "zh-hans",
          iconFileId: null,
        }),
      ],
    );
  });

  it("treats missing creatorVersion metadata as project format 0", async () => {
    mocked.exists.mockResolvedValue(true);
    mocked.connection.select.mockResolvedValue([]);

    const { storageAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    const creatorVersion = await storageAdapter.readCreatorVersionByReference({
      reference: {
        projectPath: "/projects/legacy",
      },
    });

    expect(creatorVersion).toBe(0);
  });

  it("throws a database-open error when project.db is missing", async () => {
    mocked.exists.mockResolvedValue(false);

    const { storageAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await expect(
      storageAdapter.readCreatorVersionByReference({
        reference: {
          projectPath: "/projects/missing",
        },
      }),
    ).rejects.toThrow("unable to open database file");
    expect(mocked.getManagedSqliteConnection).not.toHaveBeenCalled();
  });

  it("seeds the main materialized view checkpoint during project initialization", async () => {
    const store = {
      clearEvents: vi.fn(async () => {}),
      clearMaterializedViewCheckpoints: vi.fn(async () => {}),
      insertDraft: vi.fn(async () => {}),
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      app: {
        set: vi.fn(async () => {}),
      },
    };
    const templateState = structuredClone(initialProjectData);

    mocked.loadTemplate.mockResolvedValue(structuredClone(templateState));
    mocked.resolveProjectResolutionForWrite.mockReturnValue(
      templateState.project.resolution,
    );
    mocked.scaleTemplateProjectStateForResolution.mockImplementation(
      (value) => value,
    );
    mocked.createPersistedTauriProjectStore.mockResolvedValue(store);
    mocked.createProjectCreateRepositoryEvent.mockReturnValue({
      id: "project-create:project-1",
      partition: "m",
      projectId: "project-1",
      type: "project.create",
      schemaVersion: 1,
      payload: {
        state: structuredClone(templateState),
      },
      clientTs: 1,
      meta: {
        clientTs: 1,
      },
    });
    const { storageAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await storageAdapter.initializeProject({
      projectId: "project-1",
      projectPath: "/projects/project-1",
      template: "blank",
      projectInfo: {
        id: "project-1",
        name: "Project 1",
      },
      projectResolution: templateState.project.resolution,
    });

    expect(store.clearEvents).toHaveBeenCalledTimes(1);
    expect(store.clearMaterializedViewCheckpoints).toHaveBeenCalledTimes(1);
    expect(store.insertDraft).toHaveBeenCalledTimes(1);
    expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledTimes(1);

    const draftEvents = [store.insertDraft.mock.calls[0]?.[0]];
    const checkpoint = store.saveMaterializedViewCheckpoint.mock.calls[0]?.[0];
    const appValues = new Map(store.app.set.mock.calls);

    expectInitializedProjectStorageContract({
      projectId: "project-1",
      creatorVersion: 2,
      templateState,
      expectedProjectInfo: {
        id: "project-1",
        namespace: "",
        name: "Project 1",
        description: "",
        iconFileId: null,
      },
      draftEvents,
      committedEvents: [],
      checkpoint,
      storedCreatorVersion: appValues.get("creatorVersion"),
      storedProjectInfo: appValues.get("projectInfo"),
    });
  });

  it("persists a projection gap for incompatible remote commands", async () => {
    const session = createSessionMock();
    const repository = {
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const repositoryStore = {
      app: {
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
    };
    mocked.createProjectCollabService.mockReturnValue(session);

    const { collabAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await collabAdapter.createSessionForProject({
      projectId: "project-1",
      token: "token-1",
      userId: "user-1",
      clientId: "client-1",
      mode: "explicit",
      getRepositoryByProject: async () => repository,
      getStoreByProject: async () => repositoryStore,
    });

    const collabConfig = mocked.createProjectCollabService.mock.calls[0][0];
    await collabConfig.onCommittedCommand({
      command: createRemoteSceneCreateCommand({ schemaVersion: 2 }),
      committedEvent: {
        id: "evt-2",
        committedId: 2,
      },
      sourceType: "remote",
      isFromCurrentActor: false,
    });

    expect(mocked.applyCommandToRepository).not.toHaveBeenCalled();
    expect(repositoryStore.app.set).toHaveBeenCalledWith(
      "projectorGap",
      expect.objectContaining({
        commandType: "scene.create",
        remoteSchemaVersion: 2,
        supportedSchemaVersion: 1,
      }),
    );
    expect(repositoryStore.app.remove).not.toHaveBeenCalled();
  });

  it("applies compatible remote commands and clears projection-gap state", async () => {
    const session = createSessionMock();
    const repository = {
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const repositoryStore = {
      app: {
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
    };
    mocked.createProjectCollabService.mockReturnValue(session);
    mocked.applyCommandToRepository.mockResolvedValue({
      events: [{ id: "evt-local-1" }],
      mode: "single",
    });

    const { collabAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await collabAdapter.createSessionForProject({
      projectId: "project-1",
      token: "token-1",
      userId: "user-1",
      clientId: "client-1",
      mode: "explicit",
      getRepositoryByProject: async () => repository,
      getStoreByProject: async () => repositoryStore,
    });

    const command = createRemoteSceneCreateCommand();
    const collabConfig = mocked.createProjectCollabService.mock.calls[0][0];
    await collabConfig.onCommittedCommand({
      command,
      committedEvent: {
        id: "evt-3",
        committedId: 3,
      },
      sourceType: "remote",
      isFromCurrentActor: false,
    });

    expect(mocked.applyCommandToRepository).toHaveBeenCalledWith({
      repository,
      command,
      projectId: "project-1",
    });
    expect(repositoryStore.app.remove).toHaveBeenCalledWith("projectorGap");
  });

  it("uses a local-only session in local mode without starting the sync client", async () => {
    const repository = {
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const repositoryStore = {
      insertDraft: vi.fn(async () => {}),
      insertDrafts: vi.fn(async () => {}),
    };

    const { collabAdapter } = createTauriProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    const session = await collabAdapter.createSessionForProject({
      projectId: "project-1",
      userId: "user-1",
      clientId: "client-1",
      mode: "local",
      getRepositoryByProject: async () => repository,
      getStoreByProject: async () => repositoryStore,
    });

    expect(mocked.createProjectCollabService).not.toHaveBeenCalled();

    await expect(
      session.submitCommand({
        id: "cmd-1",
        partition: "m",
        projectId: "project-1",
        type: "scene.create",
        schemaVersion: 1,
        payload: {
          sceneId: "scene-1",
          data: {
            name: "Scene 1",
          },
        },
        clientTs: 10,
        meta: {
          clientTs: 10,
        },
      }),
    ).resolves.toEqual({
      valid: true,
      commandId: "cmd-1",
    });

    expect(repositoryStore.insertDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "cmd-1",
        projectId: "project-1",
        type: "scene.create",
        createdAt: 10,
      }),
    );
  });
});
