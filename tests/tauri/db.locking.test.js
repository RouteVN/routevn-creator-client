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
} = {}) => {
  const kv = new Map();
  const events = [];
  const executeFailures = new Map(Object.entries(lockedExecuteBySql));
  const selectFailures = new Map(Object.entries(lockedSelectBySql));

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
      } else if (String(sql).includes("DELETE FROM kv")) {
        kv.delete(args[0]);
      } else if (String(sql).includes("INSERT INTO events")) {
        events.push({
          type: args[0],
          payload: args[1],
        });
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
});
