import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  exists: vi.fn(),
  join: vi.fn(),
  connection: {
    init: vi.fn(async () => {}),
    select: vi.fn(async () => []),
  },
  getManagedSqliteConnection: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: vi.fn(async () => {}),
  writeFile: vi.fn(async () => {}),
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
  createPersistedTauriProjectStore: vi.fn(),
  evictPersistedTauriProjectStoreCache: vi.fn(async () => {}),
  toBootstrappedCommittedEvent: vi.fn(),
}));

vi.mock(
  "../../src/deps/services/shared/collab/createProjectCollabService.js",
  () => ({
    createProjectCollabService: vi.fn(),
  }),
);

vi.mock("../../src/deps/services/shared/collab/projectorCache.js", () => ({
  clearProjectionGap: vi.fn(),
  saveProjectionGap: vi.fn(),
}));

vi.mock(
  "../../src/deps/services/web/collab/createWebSocketTransport.js",
  () => ({
    createWebSocketTransport: vi.fn(),
  }),
);

vi.mock("../../src/deps/services/shared/projectRepository.js", () => ({
  applyCommandToRepository: vi.fn(),
  assertSupportedProjectState: vi.fn(),
  createProjectCreateRepositoryEvent: vi.fn(),
}));

vi.mock("../../src/deps/clients/web/templateLoader.js", () => ({
  loadTemplate: vi.fn(),
  getTemplateFiles: vi.fn(async () => []),
}));

vi.mock("../../src/internal/projectResolution.js", () => ({
  resolveProjectResolutionForWrite: vi.fn(),
  scaleTemplateProjectStateForResolution: vi.fn(),
}));

import { createTauriProjectServiceAdapters } from "../../src/deps/services/tauri/projectServiceAdapters.js";

describe("tauri project service adapters preflight reads", () => {
  beforeEach(() => {
    mocked.exists.mockReset();
    mocked.join.mockReset();
    mocked.connection.init.mockClear();
    mocked.connection.select.mockReset();
    mocked.getManagedSqliteConnection.mockReset();

    mocked.join.mockImplementation(async (...parts) => parts.join("/"));
    mocked.getManagedSqliteConnection.mockReturnValue(mocked.connection);
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
});
