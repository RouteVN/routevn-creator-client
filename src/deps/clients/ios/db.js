import { createIOSSqliteConnection } from "./sqlite.js";

const stripSqlitePrefix = (value) =>
  String(value || "").replace(/^sqlite:/, "");

const resolveDbPath = ({ path, projectPath }) => {
  if (projectPath) {
    return `projects/${projectPath}/project.db`;
  }

  const normalizedPath = stripSqlitePrefix(path);
  if (!normalizedPath) {
    throw new Error("path is required for iOS DB.");
  }
  return normalizedPath.endsWith(".db")
    ? normalizedPath
    : `${normalizedPath}.db`;
};

export const createDb = ({ path, projectPath, withEvents = false }) => {
  const dbPath = resolveDbPath({ path, projectPath });
  const db = createIOSSqliteConnection({ dbPath });
  let initialized = false;
  let operationQueue = Promise.resolve();

  const queueDbOperation = async (operation) => {
    const nextOperation = operationQueue.then(async () => operation());
    operationQueue = nextOperation.catch(() => {});
    return nextOperation;
  };

  const ensureInitialized = () => {
    if (!initialized) {
      throw new Error("Db not initialized. Call init() first.");
    }
  };

  const instance = {
    async init() {
      return queueDbOperation(async () => {
        await db.init();
        await db.execute(`
          CREATE TABLE IF NOT EXISTS kv (
            key TEXT PRIMARY KEY,
            value TEXT
          )
        `);

        if (withEvents) {
          await db.execute(`
            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              type TEXT NOT NULL,
              payload TEXT,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
        }

        initialized = true;
      });
    },

    async get(key) {
      return queueDbOperation(async () => {
        ensureInitialized();
        const rows = await db.select("SELECT value FROM kv WHERE key = ?", [
          key,
        ]);
        const row = Array.isArray(rows) ? rows[0] : undefined;
        if (!row?.value) {
          return null;
        }

        try {
          return JSON.parse(row.value);
        } catch {
          return row.value;
        }
      });
    },

    async set(key, value) {
      return queueDbOperation(async () => {
        ensureInitialized();
        await db.execute(
          "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
          [key, JSON.stringify(value)],
        );
      });
    },

    async getOrSet(key, value) {
      if (typeof key !== "string" || key.length === 0) {
        throw new Error("Db key must be a non-empty string");
      }
      const valueJson = JSON.stringify(value);
      if (valueJson === undefined) {
        throw new Error("Db value must be JSON-serializable");
      }
      return queueDbOperation(async () => {
        ensureInitialized();
        await db.execute(
          "INSERT OR IGNORE INTO kv (key, value) VALUES (?, ?)",
          [key, valueJson],
        );
        const rows = await db.select("SELECT value FROM kv WHERE key = ?", [
          key,
        ]);
        if (!rows?.length) throw new Error("Db value was not persisted");
        return JSON.parse(rows[0].value);
      });
    },

    async remove(key) {
      return queueDbOperation(async () => {
        ensureInitialized();
        await db.execute("DELETE FROM kv WHERE key = ?", [key]);
      });
    },
  };

  if (withEvents) {
    instance.getEvents = async ({ since } = {}) => {
      return queueDbOperation(async () => {
        ensureInitialized();
        const rows =
          since === undefined
            ? await db.select(
                "SELECT id, type, payload FROM events ORDER BY id",
              )
            : await db.select(
                "SELECT id, type, payload FROM events WHERE id > ? ORDER BY id",
                [since],
              );
        return rows.map((row) => ({
          type: row.type,
          payload: row.payload ? JSON.parse(row.payload) : null,
        }));
      });
    };

    instance.appendEvent = async (event) => {
      return queueDbOperation(async () => {
        ensureInitialized();
        await db.execute("INSERT INTO events (type, payload) VALUES (?, ?)", [
          event.type,
          JSON.stringify(event.payload),
        ]);
      });
    };

    instance.getSnapshot = async () => instance.get("_eventsSnapshot");
    instance.setSnapshot = async (snapshot) =>
      instance.set("_eventsSnapshot", snapshot);
  }

  return instance;
};
