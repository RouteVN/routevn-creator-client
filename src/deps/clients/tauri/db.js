import { join } from "@tauri-apps/api/path";
import {
  SQLITE_BUSY_TIMEOUT_MS,
  withSqliteLockRetry,
} from "../../../internal/sqliteLocking.js";
import { getManagedSqliteConnection } from "./sqliteConnectionManager.js";

const KV_BATCH_UPSERT_SQL = `
  INSERT INTO kv (key, value)
  SELECT
    json_extract(value, '$.key'),
    json_extract(value, '$.value')
  FROM json_each($1)
  WHERE 1
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`;

const requireKey = (key, label = "Db key") => {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return key;
};

const serializeValue = (value, label = "Db value") => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(`${label} must be JSON-serializable`);
  }

  return serialized;
};

const parseStoredValue = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeBatchOperations = ({ puts = [], deletes = [] } = {}) => {
  if (!Array.isArray(puts)) {
    throw new Error("Db batch puts must be an array");
  }
  if (!Array.isArray(deletes)) {
    throw new Error("Db batch deletes must be an array");
  }

  const operationsByKey = new Map();
  puts.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Db batch puts[${index}] must be an object`);
    }
    const key = requireKey(entry.key, `Db batch puts[${index}].key`);
    operationsByKey.set(key, {
      key,
      value: serializeValue(entry.value, `Db batch puts[${index}].value`),
    });
  });
  deletes.forEach((entry, index) => {
    const key = requireKey(entry, `Db batch deletes[${index}]`);
    operationsByKey.set(key, { key, value: null });
  });

  return Array.from(operationsByKey.values());
};

/**
 * Create a database instance
 * @param {Object} params
 * @param {string} [params.path] - Direct database path (e.g., "sqlite:app.db")
 * @param {string} [params.projectPath] - Project directory path (will create project.db inside)
 * @param {boolean} [params.withEvents=false] - Include events table for insieme
 * @param {"full"} [params.durability] - Enable WAL and FULL synchronous durability
 * @param {number} [params.schemaVersion] - Required PRAGMA user_version for this database
 * @returns {{init: Function, get: Function, set: Function, remove: Function, list: Function, applyBatch: Function, clear: Function, getEvents?: Function, appendEvent?: Function}}
 */
export const createDb = ({
  path,
  projectPath,
  withEvents = false,
  durability,
  schemaVersion,
}) => {
  if (!path && !projectPath) {
    throw new Error("Either path or projectPath is required");
  }
  if (durability !== undefined && durability !== "full") {
    throw new Error(`Unsupported Db durability mode: ${durability}`);
  }
  if (
    schemaVersion !== undefined &&
    (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1)
  ) {
    throw new Error("Db schemaVersion must be a positive safe integer");
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
        if (durability === "full") {
          await connection.select("PRAGMA journal_mode=WAL");
          await connection.execute("PRAGMA synchronous=FULL");
        }

        let currentSchemaVersion;
        if (schemaVersion !== undefined) {
          const rows = await connection.select("PRAGMA user_version");
          currentSchemaVersion = Number(rows?.[0]?.user_version ?? 0);
          if (
            currentSchemaVersion !== 0 &&
            currentSchemaVersion !== schemaVersion
          ) {
            throw new Error(
              `Unsupported Db schema version: ${currentSchemaVersion}`,
            );
          }
        }

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS kv (
              key TEXT PRIMARY KEY,
              value TEXT CHECK (value IS NULL OR json_valid(value))
            )
          `);
        await connection.execute(`
            CREATE TRIGGER IF NOT EXISTS kv_delete_null_after_insert
            AFTER INSERT ON kv
            WHEN NEW.value IS NULL
            BEGIN
              DELETE FROM kv WHERE key = NEW.key;
            END
          `);
        await connection.execute(`
            CREATE TRIGGER IF NOT EXISTS kv_delete_null_after_update
            AFTER UPDATE OF value ON kv
            WHEN NEW.value IS NULL
            BEGIN
              DELETE FROM kv WHERE key = NEW.key;
            END
          `);

        if (schemaVersion !== undefined && currentSchemaVersion === 0) {
          await connection.execute(`PRAGMA user_version=${schemaVersion}`);
        }

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
      const normalizedKey = requireKey(key);
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        const result = await withSqliteLockRetry(() =>
          db.select("SELECT value FROM kv WHERE key = $1", [normalizedKey]),
        );
        if (result && result.length > 0) {
          return parseStoredValue(result[0].value);
        }
        return null;
      });
    },

    async set(key, value) {
      const normalizedKey = requireKey(key);
      const jsonValue = serializeValue(value);
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        await withSqliteLockRetry(() =>
          db.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ($1, $2)", [
            normalizedKey,
            jsonValue,
          ]),
        );
      });
    },

    async remove(key) {
      const normalizedKey = requireKey(key);
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        await withSqliteLockRetry(() =>
          db.execute("DELETE FROM kv WHERE key = $1", [normalizedKey]),
        );
      });
    },

    async list({ prefix } = {}) {
      if (prefix !== undefined && typeof prefix !== "string") {
        throw new Error("Db list prefix must be a string");
      }

      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }

        const rows = await withSqliteLockRetry(() =>
          prefix === undefined
            ? db.select("SELECT key, value FROM kv ORDER BY key")
            : db.select(
                "SELECT key, value FROM kv WHERE substr(key, 1, $1) = $2 ORDER BY key",
                [prefix.length, prefix],
              ),
        );
        return rows.map((row) => ({
          key: row.key,
          value: parseStoredValue(row.value),
        }));
      });
    },

    async applyBatch(batch) {
      const operations = normalizeBatchOperations(batch);
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        if (operations.length === 0) {
          return;
        }
        await withSqliteLockRetry(() =>
          db.execute(KV_BATCH_UPSERT_SQL, [JSON.stringify(operations)]),
        );
      });
    },

    async clear() {
      return queueDbOperation(async () => {
        if (!initialized) {
          throw new Error("Db not initialized. Call init() first.");
        }
        await withSqliteLockRetry(() => db.execute("DELETE FROM kv"));
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
