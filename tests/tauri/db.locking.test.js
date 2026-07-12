import SqliteDatabase from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const joinMock = vi.fn(async (...parts) => parts.join("/"));
const loadMock = vi.fn();

vi.mock("@tauri-apps/api/path", () => ({
  join: joinMock,
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: loadMock,
  },
}));

const createLockError = (message = "database is locked") => {
  const error = new Error(message);
  error.code = 5;
  return error;
};

const createFakeDb = ({
  lockedExecuteBySql = {},
  lockedSelectBySql = {},
  schemaVersion = 0,
} = {}) => {
  const kv = new Map();
  const events = [];
  const executeFailures = new Map(Object.entries(lockedExecuteBySql));
  const selectFailures = new Map(Object.entries(lockedSelectBySql));
  let currentSchemaVersion = schemaVersion;

  const shouldFail = (sql, failures) => {
    for (const [pattern, remaining] of failures.entries()) {
      if (!String(sql).includes(pattern) || remaining <= 0) {
        continue;
      }
      failures.set(pattern, remaining - 1);
      return true;
    }
    return false;
  };

  return {
    execute: vi.fn(async (sql, args = []) => {
      if (shouldFail(sql, executeFailures)) {
        throw createLockError();
      }

      if (String(sql).includes("INSERT OR REPLACE INTO kv")) {
        kv.set(args[0], args[1]);
      } else if (String(sql).includes("FROM json_each($1)")) {
        JSON.parse(args[0]).forEach(({ key, value }) => {
          if (value === null) {
            kv.delete(key);
          } else {
            kv.set(key, value);
          }
        });
      } else if (String(sql).includes("DELETE FROM kv WHERE key = $1")) {
        kv.delete(args[0]);
      } else if (String(sql).trim() === "DELETE FROM kv") {
        kv.clear();
      } else if (String(sql).includes("INSERT INTO events")) {
        events.push({
          type: args[0],
          payload: args[1],
        });
      } else if (String(sql).includes("PRAGMA user_version=")) {
        currentSchemaVersion = Number(String(sql).split("=").at(-1));
      }

      return {
        rowsAffected: 1,
      };
    }),

    select: vi.fn(async (sql, args = []) => {
      if (shouldFail(sql, selectFailures)) {
        throw createLockError();
      }

      if (String(sql).includes("SELECT value FROM kv WHERE key = $1")) {
        const value = kv.get(args[0]);
        return value === undefined ? [] : [{ value }];
      }

      if (String(sql).includes("SELECT key, value FROM kv")) {
        const prefix = String(sql).includes("substr(key") ? args[1] : undefined;
        return Array.from(kv.entries())
          .filter(([key]) => prefix === undefined || key.startsWith(prefix))
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, value]) => ({ key, value }));
      }

      if (String(sql).includes("PRAGMA user_version")) {
        return [{ user_version: currentSchemaVersion }];
      }

      if (String(sql).includes("SELECT type, payload FROM events")) {
        return events.map((event) => ({
          type: event.type,
          payload: event.payload,
        }));
      }

      return [];
    }),
  };
};

describe("tauri db lock handling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    joinMock.mockReset();
    loadMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries locked init, write, and read operations", async () => {
    const fakeDb = createFakeDb({
      lockedExecuteBySql: {
        "PRAGMA busy_timeout": 1,
        "INSERT OR REPLACE INTO kv": 1,
      },
      lockedSelectBySql: {
        "SELECT value FROM kv WHERE key = $1": 1,
      },
    });
    loadMock.mockResolvedValue(fakeDb);

    const { createDb } = await import("../../src/deps/clients/tauri/db.js");
    const db = createDb({ path: "sqlite:app.db" });

    const initPromise = db.init();
    await vi.runAllTimersAsync();
    await initPromise;

    const setPromise = db.set("projectInfo", { name: "Locked Once" });
    await vi.runAllTimersAsync();
    await setPromise;

    const getPromise = db.get("projectInfo");
    await vi.runAllTimersAsync();
    await expect(getPromise).resolves.toEqual({ name: "Locked Once" });

    expect(loadMock).toHaveBeenCalledWith("sqlite:app.db");
    expect(
      fakeDb.execute.mock.calls.filter(([sql]) =>
        String(sql).includes("PRAGMA busy_timeout"),
      ).length,
    ).toBe(2);
    expect(
      fakeDb.execute.mock.calls.filter(([sql]) =>
        String(sql).includes("INSERT OR REPLACE INTO kv"),
      ).length,
    ).toBe(2);
    expect(
      fakeDb.select.mock.calls.filter(([sql]) =>
        String(sql).includes("SELECT value FROM kv WHERE key = $1"),
      ).length,
    ).toBe(2);
  });

  it("serializes concurrent reads and writes on the same connection", async () => {
    let activeOperations = 0;
    let maxConcurrentOperations = 0;
    const kv = new Map();

    const fakeDb = {
      execute: vi.fn(
        async (sql, args = []) =>
          new Promise((resolve) => {
            activeOperations += 1;
            maxConcurrentOperations = Math.max(
              maxConcurrentOperations,
              activeOperations,
            );

            globalThis.setTimeout(() => {
              if (String(sql).includes("INSERT OR REPLACE INTO kv")) {
                kv.set(args[0], args[1]);
              }
              activeOperations -= 1;
              resolve({ rowsAffected: 1 });
            }, 10);
          }),
      ),
      select: vi.fn(
        async (sql, args = []) =>
          new Promise((resolve) => {
            activeOperations += 1;
            maxConcurrentOperations = Math.max(
              maxConcurrentOperations,
              activeOperations,
            );

            globalThis.setTimeout(() => {
              const value = String(sql).includes("SELECT value FROM kv")
                ? kv.get(args[0])
                : undefined;
              activeOperations -= 1;
              resolve(value === undefined ? [] : [{ value }]);
            }, 10);
          }),
      ),
    };
    loadMock.mockResolvedValue(fakeDb);

    const { createDb } = await import("../../src/deps/clients/tauri/db.js");
    const db = createDb({ path: "sqlite:app.db" });

    const initPromise = db.init();
    await vi.runAllTimersAsync();
    await initPromise;

    const setPromise = db.set("projectEntries", [{ id: "project-1" }]);
    const getPromise = db.get("projectEntries");

    await vi.runAllTimersAsync();

    await expect(setPromise).resolves.toBeUndefined();
    await expect(getPromise).resolves.toEqual([{ id: "project-1" }]);
    expect(maxConcurrentOperations).toBe(1);
  });

  it("recovers from a closed-pool app db handle by reopening and retrying once", async () => {
    const kv = new Map();
    const staleDb = {
      execute: vi.fn(async (sql, _args = []) => {
        if (String(sql).includes("PRAGMA busy_timeout")) {
          return { rowsAffected: 0 };
        }
        if (String(sql).includes("CREATE TABLE IF NOT EXISTS kv")) {
          return { rowsAffected: 0 };
        }
        if (String(sql).includes("INSERT OR REPLACE INTO kv")) {
          throw new Error("attempted to acquire a connection on a closed pool");
        }
        return { rowsAffected: 0 };
      }),
      select: vi.fn(async (sql, args = []) => {
        const value = kv.get(args[0]);
        return value === undefined ? [] : [{ value }];
      }),
      close: vi.fn(async () => {}),
    };
    const freshDb = {
      execute: vi.fn(async (sql, args = []) => {
        if (String(sql).includes("INSERT OR REPLACE INTO kv")) {
          kv.set(args[0], args[1]);
        }
        return { rowsAffected: 1 };
      }),
      select: vi.fn(async (sql, args = []) => {
        const value = kv.get(args[0]);
        return value === undefined ? [] : [{ value }];
      }),
    };
    loadMock.mockResolvedValueOnce(staleDb).mockResolvedValueOnce(freshDb);

    const { createDb } = await import("../../src/deps/clients/tauri/db.js");
    const db = createDb({ path: "sqlite:app.db" });

    await db.init();
    await db.set("projectEntries", [{ id: "project-1" }]);

    await expect(db.get("projectEntries")).resolves.toEqual([
      { id: "project-1" },
    ]);
    expect(loadMock).toHaveBeenCalledTimes(2);
    expect(staleDb.close).toHaveBeenCalledWith("sqlite:app.db");
  });

  it("lists, atomically batches, and clears JSON key values", async () => {
    const fakeDb = createFakeDb();
    loadMock.mockResolvedValue(fakeDb);

    const { createDb } = await import("../../src/deps/clients/tauri/db.js");
    const db = createDb({
      path: "sqlite:runtime.db",
      durability: "full",
      schemaVersion: 1,
    });
    await db.init();

    await db.applyBatch({
      puts: [
        { key: "saveSlots:1", value: { slotId: 1 } },
        { key: "saveSlots:2", value: { slotId: 2 } },
        { key: "globalRuntime", value: { muteAll: false } },
      ],
    });
    await db.applyBatch({
      puts: [{ key: "saveSlots:2", value: { slotId: 22 } }],
      deletes: ["saveSlots:1"],
    });

    await expect(db.list({ prefix: "saveSlots:" })).resolves.toEqual([
      { key: "saveSlots:2", value: { slotId: 22 } },
    ]);
    await expect(db.get("globalRuntime")).resolves.toEqual({ muteAll: false });

    const batchCalls = fakeDb.execute.mock.calls.filter(([sql]) =>
      String(sql).includes("FROM json_each($1)"),
    );
    expect(batchCalls).toHaveLength(2);
    expect(fakeDb.select).toHaveBeenCalledWith("PRAGMA journal_mode=WAL");
    expect(fakeDb.execute).toHaveBeenCalledWith("PRAGMA synchronous=FULL");
    expect(fakeDb.execute).toHaveBeenCalledWith("PRAGMA user_version=1");

    await db.clear();
    await expect(db.list()).resolves.toEqual([]);
  });

  it("executes atomic batch puts and deletes against real SQLite", async () => {
    const sqlite = new SqliteDatabase(":memory:");
    const bindParameters = (args) =>
      Object.fromEntries(
        args.map((value, index) => [String(index + 1), value]),
      );
    const sqlitePluginDb = {
      execute: vi.fn(async (sql, args = []) => {
        const statement = sqlite.prepare(sql);
        const result =
          args.length === 0
            ? statement.run()
            : statement.run(bindParameters(args));
        return {
          lastInsertId: Number(result.lastInsertRowid),
          rowsAffected: result.changes,
        };
      }),
      select: vi.fn(async (sql, args = []) => {
        const statement = sqlite.prepare(sql);
        return args.length === 0
          ? statement.all()
          : statement.all(bindParameters(args));
      }),
    };
    loadMock.mockResolvedValue(sqlitePluginDb);

    try {
      const { createDb } = await import("../../src/deps/clients/tauri/db.js");
      const db = createDb({
        path: "sqlite:runtime.db",
        schemaVersion: 1,
      });
      await db.init();
      await db.applyBatch({
        puts: [
          { key: "saveSlots:1", value: { slotId: 1 } },
          { key: "saveSlots:2", value: { slotId: 2 } },
          { key: "globalRuntime", value: { muteAll: false } },
        ],
      });
      await db.applyBatch({
        puts: [{ key: "saveSlots:2", value: { slotId: 22 } }],
        deletes: ["saveSlots:1"],
      });

      await expect(db.list()).resolves.toEqual([
        { key: "globalRuntime", value: { muteAll: false } },
        { key: "saveSlots:2", value: { slotId: 22 } },
      ]);
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM kv WHERE value IS NULL")
          .get().count,
      ).toBe(0);
      expect(sqlite.pragma("user_version", { simple: true })).toBe(1);
      expect(() =>
        sqlite
          .prepare("INSERT INTO kv (key, value) VALUES (?, ?)")
          .run("corrupt", "not-json"),
      ).toThrow();
    } finally {
      sqlite.close();
    }
  });

  it("rejects malformed batch input before touching SQLite", async () => {
    const fakeDb = createFakeDb();
    loadMock.mockResolvedValue(fakeDb);

    const { createDb } = await import("../../src/deps/clients/tauri/db.js");
    const db = createDb({ path: "sqlite:runtime.db" });
    await db.init();
    const callsBeforeBatch = fakeDb.execute.mock.calls.length;

    await expect(
      db.applyBatch({ puts: [{ key: "invalid", value: undefined }] }),
    ).rejects.toThrow("Db batch puts[0].value must be JSON-serializable");
    expect(fakeDb.execute).toHaveBeenCalledTimes(callsBeforeBatch);
  });

  it("rejects an unsupported nonzero schema version before creating tables", async () => {
    const fakeDb = createFakeDb({ schemaVersion: 2 });
    loadMock.mockResolvedValue(fakeDb);

    const { createDb } = await import("../../src/deps/clients/tauri/db.js");
    const db = createDb({
      path: "sqlite:runtime.db",
      schemaVersion: 1,
    });

    await expect(db.init()).rejects.toThrow("Unsupported Db schema version: 2");
    expect(
      fakeDb.execute.mock.calls.some(([sql]) =>
        String(sql).includes("CREATE TABLE IF NOT EXISTS kv"),
      ),
    ).toBe(false);
  });

  it("requires initialization even for an empty batch", async () => {
    const fakeDb = createFakeDb();
    loadMock.mockResolvedValue(fakeDb);

    const { createDb } = await import("../../src/deps/clients/tauri/db.js");
    const db = createDb({ path: "sqlite:runtime.db" });

    await expect(db.applyBatch()).rejects.toThrow(
      "Db not initialized. Call init() first.",
    );
    expect(fakeDb.execute).not.toHaveBeenCalled();
  });
});
