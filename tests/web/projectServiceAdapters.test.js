import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createInsiemeWebStoreAdapter: vi.fn(),
  initializeProject: vi.fn(),
  readProjectAppValue: vi.fn(),
  createProjectCollabService: vi.fn(),
  createPersistedInMemoryClientStore: vi.fn(),
  deletePersistedInMemoryClientStore: vi.fn(),
  loadCommittedCursor: vi.fn(),
  saveCommittedCursor: vi.fn(),
  clearCommittedCursor: vi.fn(),
  createWebSocketTransport: vi.fn(),
  applyCommandToRepository: vi.fn(),
  assertSupportedProjectState: vi.fn(),
}));

vi.mock("../../src/deps/clients/web/webRepositoryAdapter.js", () => ({
  createInsiemeWebStoreAdapter: mocked.createInsiemeWebStoreAdapter,
  initializeProject: mocked.initializeProject,
  readProjectAppValue: mocked.readProjectAppValue,
}));

vi.mock(
  "../../src/deps/services/shared/collab/createProjectCollabService.js",
  () => ({
    createProjectCollabService: mocked.createProjectCollabService,
  }),
);

vi.mock("../../src/deps/services/web/collabClientStore.js", () => ({
  createPersistedInMemoryClientStore: mocked.createPersistedInMemoryClientStore,
  deletePersistedInMemoryClientStore: mocked.deletePersistedInMemoryClientStore,
}));

vi.mock("../../src/deps/services/web/collabCommittedCursorStore.js", () => ({
  clearCommittedCursor: mocked.clearCommittedCursor,
  loadCommittedCursor: mocked.loadCommittedCursor,
  saveCommittedCursor: mocked.saveCommittedCursor,
}));

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
    assertSupportedProjectState: mocked.assertSupportedProjectState,
  };
});

import {
  createProjectCreateRepositoryEvent,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";
import { createWebProjectServiceAdapters } from "../../src/deps/services/web/projectServiceAdapters.js";

const createSessionMock = () => ({
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  submitEvent: vi.fn(async () => {}),
  syncNow: vi.fn(async () => {}),
  flushDrafts: vi.fn(async () => {}),
  getActor: vi.fn(() => ({
    userId: "user-1",
    clientId: "client-1",
  })),
  setOnlineTransport: vi.fn(async () => {}),
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

describe("web project service adapters", () => {
  beforeEach(() => {
    mocked.createInsiemeWebStoreAdapter.mockReset();
    mocked.initializeProject.mockReset();
    mocked.readProjectAppValue.mockReset();
    mocked.createProjectCollabService.mockReset();
    mocked.createPersistedInMemoryClientStore.mockReset();
    mocked.deletePersistedInMemoryClientStore.mockReset();
    mocked.loadCommittedCursor.mockReset();
    mocked.saveCommittedCursor.mockReset();
    mocked.clearCommittedCursor.mockReset();
    mocked.createWebSocketTransport.mockReset();
    mocked.applyCommandToRepository.mockReset();
    mocked.assertSupportedProjectState.mockReset();

    mocked.createPersistedInMemoryClientStore.mockResolvedValue({
      close: vi.fn(async () => {}),
    });
    mocked.loadCommittedCursor.mockResolvedValue(0);
    mocked.createWebSocketTransport.mockReturnValue({
      kind: "transport",
    });
  });

  it("replays repository history from the project store adapter without forcing repository history load", async () => {
    const repositoryEvent = createProjectCreateRepositoryEvent({
      projectId: "project-1",
      state: initialProjectData,
    });
    const repository = {
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const adapter = {
      listCommittedAfter: vi.fn(async () => [structuredClone(repositoryEvent)]),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      app: {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => {}),
      },
    };
    const session = createSessionMock();
    mocked.createProjectCollabService.mockReturnValue(session);

    const { collabAdapter } = createWebProjectServiceAdapters({
      collabLog: () => {},
      creatorVersion: 2,
    });

    await collabAdapter.createSessionForProject({
      projectId: "project-1",
      token: "token-1",
      userId: "user-1",
      clientId: "client-1",
      endpointUrl: "ws://localhost:1234",
      mode: "explicit",
      getRepositoryByProject: async () => repository,
      getStoreByProject: async () => adapter,
      getProjectInfoByProjectId: async () => ({
        name: "Project 1",
        description: "",
      }),
    });

    expect(adapter.listCommittedAfter).toHaveBeenCalledTimes(1);
    expect(session.submitEvent).toHaveBeenCalledTimes(1);
    expect(session.flushDrafts).toHaveBeenCalledTimes(1);
    expect(session.syncNow).toHaveBeenCalledTimes(2);
  });

  it("persists a projection gap for incompatible remote commands", async () => {
    const repository = {
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const adapter = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      app: {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
    };
    const session = createSessionMock();
    mocked.createProjectCollabService.mockReturnValue(session);

    const { collabAdapter } = createWebProjectServiceAdapters({
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
      getStoreByProject: async () => adapter,
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
    expect(adapter.app.set).toHaveBeenCalledWith(
      "projectorGap",
      expect.objectContaining({
        commandType: "scene.create",
        remoteSchemaVersion: 2,
        supportedSchemaVersion: 1,
      }),
    );
    expect(adapter.app.remove).not.toHaveBeenCalled();
    expect(mocked.saveCommittedCursor).not.toHaveBeenCalled();
  });

  it("applies compatible remote commands and clears projection-gap state", async () => {
    const repository = {
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const adapter = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      app: {
        get: vi.fn(async () => undefined),
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
    };
    const session = createSessionMock();
    mocked.createProjectCollabService.mockReturnValue(session);
    mocked.applyCommandToRepository.mockResolvedValue({
      events: [{ id: "evt-local-1" }],
      mode: "single",
    });

    const { collabAdapter } = createWebProjectServiceAdapters({
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
      getStoreByProject: async () => adapter,
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
    expect(mocked.saveCommittedCursor).toHaveBeenCalledWith({
      adapter,
      projectId: "project-1",
      cursor: 3,
    });
    expect(adapter.app.remove).toHaveBeenCalledWith("projectorGap");
  });
});
