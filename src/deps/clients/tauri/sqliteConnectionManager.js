import Database from "@tauri-apps/plugin-sql";
import {
  SQLITE_BUSY_TIMEOUT_MS,
  withSqliteLockRetry,
} from "../../../internal/sqliteLocking.js";

const connectionsByPath = new Map();

const isClosedPoolError = (error) =>
  String(error?.message || "")
    .toLowerCase()
    .includes("closed pool");

const createManagedSqliteConnection = ({
  dbPath,
  busyTimeoutMs = SQLITE_BUSY_TIMEOUT_MS,
  onConnect,
}) => {
  let db;
  let connectPromise;

  const connect = async ({ forceReload = false } = {}) => {
    if (db && !forceReload) {
      return db;
    }

    if (connectPromise && !forceReload) {
      return connectPromise;
    }

    const nextConnectPromise = (async () => {
      const nextDb = await Database.load(dbPath);
      await withSqliteLockRetry(() =>
        nextDb.execute(`PRAGMA busy_timeout=${busyTimeoutMs}`),
      );
      if (typeof onConnect === "function") {
        await onConnect(nextDb);
      }
      db = nextDb;
      return nextDb;
    })();

    const trackedConnectPromise = nextConnectPromise.finally(() => {
      if (connectPromise === trackedConnectPromise) {
        connectPromise = undefined;
      }
    });
    connectPromise = trackedConnectPromise;

    return trackedConnectPromise;
  };

  const withRecoveredConnection = async (operation) => {
    let hasRetriedClosedPool = false;

    while (true) {
      const currentDb = await connect();

      try {
        return await operation(currentDb);
      } catch (error) {
        if (hasRetriedClosedPool || !isClosedPoolError(error)) {
          throw error;
        }

        hasRetriedClosedPool = true;
        if (typeof currentDb?.close === "function") {
          try {
            await currentDb.close(dbPath);
          } catch {
            // best-effort stale-handle disposal before reconnect
          }
        }
        db = undefined;
        connectPromise = undefined;
      }
    }
  };

  return {
    dbPath,

    async init() {
      await connect();
    },

    async execute(sql, args = []) {
      return withRecoveredConnection((currentDb) =>
        currentDb.execute(sql, Array.isArray(args) ? args : []),
      );
    },

    async select(sql, args = []) {
      return withRecoveredConnection((currentDb) =>
        currentDb.select(sql, Array.isArray(args) ? args : []),
      );
    },

    async close() {
      connectionsByPath.delete(dbPath);
      const currentDb = db;
      db = undefined;
      connectPromise = undefined;

      if (typeof currentDb?.close === "function") {
        await currentDb.close(dbPath);
      }
    },
  };
};

export const getManagedSqliteConnection = ({
  dbPath,
  busyTimeoutMs = SQLITE_BUSY_TIMEOUT_MS,
  onConnect,
}) => {
  if (!dbPath) {
    throw new Error("dbPath is required");
  }

  const existing = connectionsByPath.get(dbPath);
  if (existing) {
    return existing;
  }

  const connection = createManagedSqliteConnection({
    dbPath,
    busyTimeoutMs,
    onConnect,
  });
  connectionsByPath.set(dbPath, connection);
  return connection;
};
