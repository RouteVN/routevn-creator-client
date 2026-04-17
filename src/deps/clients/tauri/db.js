import { join } from "@tauri-apps/api/path";
import {
  SQLITE_BUSY_TIMEOUT_MS,
  withSqliteLockRetry,
} from "../../../internal/sqliteLocking.js";
import { getManagedSqliteConnection } from "./sqliteConnectionManager.js";

/**
 * Create a database instance
 * @param {Object} params
 * @param {string} [params.path] - Direct database path (e.g., "sqlite:app.db")
 * @param {string} [params.projectPath] - Project directory path (will create project.db inside)
 * @param {boolean} [params.withEvents=false] - Include events table for insieme
 * @returns {{init: Function, get: Function, set: Function, remove: Function, getEvents?: Function, appendEvent?: Function}}
 */
export const createDb = ({ path, projectPath, withEvents = false }) => {
  if (!path && !projectPath) {
    throw new Error("Either path or projectPath is required");
  }

  let db = null;
  let initialized = false;
  let resolvedDbPath;
  let operationQueue = Promise.resolve();

  const queueDbOperation = async (operation) => {
    const nextOperation = operationQueue.then(async () => operation());
    operationQueue = nextOperation.catch(() => {});
    return nextOperation;
  };

  const ensureConnection = async () => {
    if (initialized && db) {
      return;
    }

    if (!resolvedDbPath) {
      resolvedDbPath = path;
      if (projectPath) {
        const fullPath = await join(projectPath, "project.db");
        resolvedDbPath = `sqlite:${fullPath}`;
      }
    }

    db = getManagedSqliteConnection({
      dbPath: resolvedDbPath,
      busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
      onConnect: async (connection) => {
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS kv (
              key TEXT PRIMARY KEY,
              value TEXT
            )
          `);

        if (withEvents) {
          await connection.execute(`
              CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              )
            `);
        }
      },
    });

    await db.init();

    initialized = true;
  };

  const instance = {
    async init() {
      return queueDbOperation(async () => ensureConnection());
    },

    async get(key) {
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        const result = await withSqliteLockRetry(() =>
          db.select("SELECT value FROM kv WHERE key = $1", [key]),
        );
        if (result && result.length > 0) {
          try {
            return JSON.parse(result[0].value);
          } catch {
            return result[0].value;
          }
        }
        return null;
      });
    },

    async set(key, value) {
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        const jsonValue = JSON.stringify(value);
        await withSqliteLockRetry(() =>
          db.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ($1, $2)", [
            key,
            jsonValue,
          ]),
        );
      });
    },

    async remove(key) {
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        await withSqliteLockRetry(() =>
          db.execute("DELETE FROM kv WHERE key = $1", [key]),
        );
      });
    },
  };

  // Add events methods if needed
  if (withEvents) {
    instance.getEvents = async (payload = {}) => {
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        const { since } = payload;

        let query = "SELECT type, payload FROM events";
        let params = [];

        if (since !== undefined) {
          query += " WHERE id > $1";
          params.push(since);
        }

        query += " ORDER BY id";

        const results = await withSqliteLockRetry(() =>
          db.select(query, params),
        );
        return results.map((row) => ({
          type: row.type,
          payload: row.payload ? JSON.parse(row.payload) : null,
        }));
      });
    };

    instance.appendEvent = async (event) => {
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        await withSqliteLockRetry(() =>
          db.execute("INSERT INTO events (type, payload) VALUES (?, ?)", [
            event.type,
            JSON.stringify(event.payload),
          ]),
        );
      });
    };

    // Snapshot support for fast initialization
    instance.getSnapshot = async () => {
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        const result = await withSqliteLockRetry(() =>
          db.select("SELECT value FROM kv WHERE key = $1", ["_eventsSnapshot"]),
        );
        if (result && result.length > 0) {
          try {
            return JSON.parse(result[0].value);
          } catch {
            return null;
          }
        }
        return null;
      });
    };

    instance.setSnapshot = async (snapshot) => {
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        const jsonValue = JSON.stringify(snapshot);
        await withSqliteLockRetry(() =>
          db.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ($1, $2)", [
            "_eventsSnapshot",
            jsonValue,
          ]),
        );
      });
    };
  }

  return instance;
};
