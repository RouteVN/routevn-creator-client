import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  exists: vi.fn(),
  join: vi.fn(),
  mkdir: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
  connection: {
    init: vi.fn(async () => {}),
    select: vi.fn(async () => []),
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
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: mocked.mkdir,
  writeFile: mocked.writeFile,
  exists: mocked.exists,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((value) => value),
  invoke: vi.fn(async () => {}),
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
    mocked.connection.init.mockClear();
    mocked.connection.select.mockReset();
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

    mocked.join.mockImplementation(async (...parts) => parts.join("/"));
    mocked.getManagedSqliteConnection.mockReturnValue(mocked.connection);
    mocked.getTemplateFiles.mockResolvedValue([]);
    mocked.createWebSocketTransport.mockReturnValue({
      kind: "transport",
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
        projectPath: "/projects/dialune",
      },
    });

    expect(creatorVersion).toBe(1);
    expect(mocked.getManagedSqliteConnection).toHaveBeenCalledWith({
      dbPath: "sqlite:/projects/dialune/project.db",
      busyTimeoutMs: 15000,
    });
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
});
