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
});
