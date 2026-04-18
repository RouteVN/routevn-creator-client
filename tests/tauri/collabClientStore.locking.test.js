import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { joinMock, loadMock, createLibsqlClientStoreMock } = vi.hoisted(() => ({
  joinMock: vi.fn(async (...parts) => parts.join("/")),
  loadMock: vi.fn(),
  createLibsqlClientStoreMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: joinMock,
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: loadMock,
  },
}));

vi.mock("insieme/client", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createLibsqlClientStore: createLibsqlClientStoreMock,
  };
});

const createLockError = (message = "database is locked") => {
  const error = new Error(message);
  error.code = 5;
  return error;
};

const createStoreMockFactory = () => {
  return (client) => ({
    init: vi.fn(async () => {}),
    loadCursor: vi.fn(async () => 0),
    insertDraft: vi.fn(async (payload) =>
      client.execute({
        sql: "INSERT DRAFT",
        args: [payload.id],
      }),
    ),
    insertDrafts: vi.fn(async (items) =>
      client.execute({
        sql: "INSERT DRAFTS",
        args: [items.length],
      }),
    ),
    loadDraftsOrdered: vi.fn(async () =>
      client.execute({
        sql: "SELECT DRAFTS",
      }),
    ),
    listDraftsOrdered: vi.fn(async () => {
      const result = await client.execute({
        sql: "SELECT DRAFTS",
      });
      return Array.isArray(result?.rows) ? result.rows : [];
    }),
    listCommittedAfter: vi.fn(async () => {
      const result = await client.execute({
        sql: "SELECT COMMITTED",
      });
      return Array.isArray(result?.rows) ? result.rows : [];
    }),
    applySubmitResult: vi.fn(async () =>
      client.execute({
        sql: "APPLY SUBMIT",
      }),
    ),
    applyCommittedBatch: vi.fn(async () =>
      client.execute({
        sql: "APPLY COMMITTED",
      }),
    ),
    loadMaterializedView: vi.fn(async () => undefined),
    evictMaterializedView: vi.fn(async () => {}),
    invalidateMaterializedView: vi.fn(async () => {}),
    flushMaterializedViews: vi.fn(async () => {}),
  });
};

describe("tauri collab client store locking", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.resetModules();
    joinMock.mockReset();
    loadMock.mockReset();
    createLibsqlClientStoreMock.mockReset();
  });

  it("retries a locked project-store write and raises the busy timeout", async () => {
    const executeFailures = new Map([
      ["PRAGMA busy_timeout", 1],
      ["INSERT DRAFT", 1],
    ]);
    const fakeDb = {
      execute: vi.fn(async (sql, args = []) => {
        for (const [pattern, remaining] of executeFailures.entries()) {
          if (!String(sql).includes(pattern) || remaining <= 0) {
            continue;
          }
          executeFailures.set(pattern, remaining - 1);
          throw createLockError();
        }

        return {
          rowsAffected: Array.isArray(args) ? args.length || 1 : 1,
        };
      }),
      select: vi.fn(async () => []),
      close: vi.fn(async () => {}),
    };
    loadMock.mockResolvedValue(fakeDb);
    createLibsqlClientStoreMock.mockImplementation(createStoreMockFactory());

    const { createPersistedTauriProjectStore } = await import(
      "../../src/deps/services/tauri/collabClientStore.js"
    );
    const store = await createPersistedTauriProjectStore({
      projectPath: "/projects/demo",
      projectId: "project-1",
    });

    await store.insertDraft({
      id: "draft-1",
      partition: "main",
      type: "layout",
      schemaVersion: 1,
      payload: {},
      clientTs: 1,
      createdAt: 1,
    });

    expect(createLibsqlClientStoreMock.mock.calls[0][1].busyTimeoutMs).toBe(
      15000,
    );
    expect(
      fakeDb.execute.mock.calls.filter(([sql]) =>
        String(sql).includes("PRAGMA busy_timeout"),
      ).length,
    ).toBe(2);
    expect(
      fakeDb.execute.mock.calls.filter(([sql]) =>
        String(sql).includes("INSERT DRAFT"),
      ).length,
    ).toBe(2);

    await store.close();
  }, 10000);

  it("serializes concurrent writes so the db never sees overlapping executes", async () => {
    let activeExecutions = 0;
    let maxConcurrentExecutions = 0;
    const fakeDb = {
      execute: vi.fn(
        async (sql) =>
          new Promise((resolve, reject) => {
            activeExecutions += 1;
            maxConcurrentExecutions = Math.max(
              maxConcurrentExecutions,
              activeExecutions,
            );

            if (activeExecutions > 1 && String(sql).includes("INSERT DRAFT")) {
              activeExecutions -= 1;
              reject(createLockError("database is locked by overlap"));
              return;
            }

            globalThis.setTimeout(() => {
              activeExecutions -= 1;
              resolve({ rowsAffected: 1 });
            }, 10);
          }),
      ),
      select: vi.fn(async () => []),
      close: vi.fn(async () => {}),
    };
    loadMock.mockResolvedValue(fakeDb);
    createLibsqlClientStoreMock.mockImplementation(createStoreMockFactory());

    const { createPersistedTauriProjectStore } = await import(
      "../../src/deps/services/tauri/collabClientStore.js"
    );
    const store = await createPersistedTauriProjectStore({
      projectPath: "/projects/serialized",
      projectId: "project-2",
    });

    const firstInsert = store.insertDraft({
      id: "draft-a",
      partition: "main",
      type: "layout",
      schemaVersion: 1,
      payload: {},
      clientTs: 1,
      createdAt: 1,
    });
    const secondInsert = store.insertDraft({
      id: "draft-b",
      partition: "main",
      type: "layout",
      schemaVersion: 1,
      payload: {},
      clientTs: 2,
      createdAt: 2,
    });

    await expect(Promise.all([firstInsert, secondInsert])).resolves.toEqual([
      {
        rows: [],
        columns: [],
        rowsAffected: 1,
      },
      {
        rows: [],
        columns: [],
        rowsAffected: 1,
      },
    ]);
    expect(maxConcurrentExecutions).toBe(1);

    await store.close();
  }, 10000);

  it("recovers a closed-pool project db handle by reopening it once", async () => {
    const staleDb = {
      execute: vi.fn(async () => ({ rowsAffected: 0 })),
      select: vi.fn(async () => {
        throw new Error("attempted to acquire a connection on a closed pool");
      }),
      close: vi.fn(async () => {}),
    };
    const freshDb = {
      execute: vi.fn(async () => ({ rowsAffected: 0 })),
      select: vi.fn(async () => []),
      close: vi.fn(async () => {}),
    };
    loadMock.mockResolvedValueOnce(staleDb).mockResolvedValueOnce(freshDb);
    createLibsqlClientStoreMock.mockImplementation(createStoreMockFactory());

    const { createPersistedTauriProjectStore } = await import(
      "../../src/deps/services/tauri/collabClientStore.js"
    );
    const store = await createPersistedTauriProjectStore({
      projectPath: "/projects/recover",
      projectId: "project-recover",
    });

    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(staleDb.close).toHaveBeenCalledWith(
      "sqlite:/projects/recover/project.db",
    );

    await store.close();
  });

  it("recovers a commit retry that loses transaction state", async () => {
    vi.useFakeTimers();
    const fakeDb = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(createLockError())
        .mockRejectedValueOnce(
          new Error("cannot commit - no transaction is active"),
        ),
    };

    const { executeTauriSqlStatement } = await import(
      "../../src/deps/services/tauri/collabClientStore.js"
    );

    const pending = executeTauriSqlStatement({
      db: fakeDb,
      sql: "COMMIT",
      retryDelaysMs: [10],
    });

    await Promise.resolve();
    expect(fakeDb.execute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toEqual({ rowsAffected: 0 });
    expect(fakeDb.execute).toHaveBeenCalledTimes(2);
  });

  it("recovers a commit that reports no active transaction immediately", async () => {
    const fakeDb = {
      execute: vi
        .fn()
        .mockRejectedValue(
          new Error("cannot commit - no transaction is active"),
        ),
    };

    const { executeTauriSqlStatement } = await import(
      "../../src/deps/services/tauri/collabClientStore.js"
    );

    await expect(
      executeTauriSqlStatement({
        db: fakeDb,
        sql: "COMMIT",
      }),
    ).resolves.toEqual({ rowsAffected: 0 });
    expect(fakeDb.execute).toHaveBeenCalledTimes(1);
  });

  it("quarantines invalid local drafts while loading repository events", async () => {
    const applySubmitResult = vi.fn(async () => {});

    const { loadRepositoryEvents } = await import(
      "../../src/deps/services/tauri/collabClientStore.js"
    );

    const events = await loadRepositoryEvents({
      projectId: "project-1",
      store: {
        applySubmitResult,
        listCommittedAfter: async () => [],
        listDraftsOrdered: async () => [
          {
            id: "draft-image-1",
            partition: "m",
            projectId: "project-1",
            userId: "user-1",
            type: "image.create",
            schemaVersion: 1,
            payload: {
              imageId: "image-1",
              data: {
                type: "image",
                name: "Broken image",
                fileId: "missing-file",
              },
              parentId: null,
              position: "last",
            },
            clientTs: 1,
            createdAt: 1,
            meta: {},
          },
        ],
      },
    });

    expect(events).toEqual([]);
    expect(applySubmitResult).toHaveBeenCalledWith({
      result: {
        id: "draft-image-1",
        status: "rejected",
        reason: "precondition_validation_failed",
        message:
          "payload.data.fileId must reference an existing non-folder file",
      },
    });
  });

  it("skips a locked passive WAL checkpoint without retrying", async () => {
    vi.useFakeTimers();
    const fakeDb = {
      execute: vi.fn(async () => ({ rowsAffected: 1 })),
      select: vi.fn(async (sql) => {
        if (String(sql).includes("wal_checkpoint")) {
          throw createLockError("database table is locked");
        }
        return [];
      }),
      close: vi.fn(async () => {}),
    };
    loadMock.mockResolvedValue(fakeDb);
    createLibsqlClientStoreMock.mockImplementation(createStoreMockFactory());

    const { createPersistedTauriProjectStore } = await import(
      "../../src/deps/services/tauri/collabClientStore.js"
    );
    const store = await createPersistedTauriProjectStore({
      projectPath: "/projects/checkpoint",
      projectId: "project-3",
    });

    await store.insertDraft({
      id: "draft-1",
      partition: "main",
      type: "layout",
      schemaVersion: 1,
      payload: {},
      clientTs: 1,
      createdAt: 1,
    });

    await vi.advanceTimersByTimeAsync(20000);

    expect(
      fakeDb.select.mock.calls.filter(([sql]) =>
        String(sql).includes("wal_checkpoint"),
      ).length,
    ).toBe(1);

    await store.close();
  });

  it("uses sequential single draft inserts instead of insertDrafts batching", async () => {
    const fakeDb = {
      execute: vi.fn(async (_sql, args = []) => ({
        rowsAffected: Array.isArray(args) ? args.length || 1 : 1,
      })),
      select: vi.fn(async () => []),
      close: vi.fn(async () => {}),
    };
    loadMock.mockResolvedValue(fakeDb);
    createLibsqlClientStoreMock.mockImplementation(createStoreMockFactory());

    const { createPersistedTauriProjectStore } = await import(
      "../../src/deps/services/tauri/collabClientStore.js"
    );
    const store = await createPersistedTauriProjectStore({
      projectPath: "/projects/sequential-insert-drafts",
      projectId: "project-4",
    });

    await store.insertDrafts([
      {
        id: "draft-a",
        partition: "main",
        type: "layout",
        schemaVersion: 1,
        payload: {},
        clientTs: 1,
        createdAt: 1,
      },
      {
        id: "draft-b",
        partition: "main",
        type: "layout",
        schemaVersion: 1,
        payload: {},
        clientTs: 2,
        createdAt: 2,
      },
    ]);

    expect(
      fakeDb.execute.mock.calls.filter(([sql]) =>
        String(sql).includes("INSERT DRAFT"),
      ).length,
    ).toBe(2);
    expect(
      fakeDb.execute.mock.calls.some(([sql]) =>
        String(sql).includes("BEGIN IMMEDIATE"),
      ),
    ).toBe(false);

    await store.close();
  });
});
