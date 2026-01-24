// SQLite wrapper for Tauri - all SQLite access goes through this file
import Database from "@tauri-apps/plugin-sql";
import { join } from "@tauri-apps/api/path";

/**
 * Create a database instance
 * @param {Object} params
 * @param {string} [params.path] - Direct database path (e.g., "sqlite:app.db")
 * @param {string} [params.projectPath] - Project directory path (will create repository.db inside)
 * @param {boolean} [params.withEvents=false] - Include events table for insieme
 * @returns {{init: Function, get: Function, set: Function, remove: Function, getEvents?: Function, appendEvent?: Function}}
 */
export const createDb = ({ path, projectPath, withEvents = false }) => {
  if (!path && !projectPath) {
    throw new Error("Either path or projectPath is required");
  }

  let db = null;
  let initialized = false;

  const instance = {
    async init() {
      let dbPath = path;
      if (projectPath) {
        const fullPath = await join(projectPath, "repository.db");
        dbPath = `sqlite:${fullPath}`;
      }

      db = await Database.load(dbPath);

      // Initialize key-value table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);

      // Initialize events table if needed
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
    },

    async get(key) {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      const result = await db.select("SELECT value FROM kv WHERE key = $1", [
        key,
      ]);
      if (result && result.length > 0) {
        try {
          return JSON.parse(result[0].value);
        } catch {
          return result[0].value;
        }
      }
      return null;
    },

    async set(key, value) {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      const jsonValue = JSON.stringify(value);
      await db.execute(
        "INSERT OR REPLACE INTO kv (key, value) VALUES ($1, $2)",
        [key, jsonValue],
      );
    },

    async remove(key) {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      await db.execute("DELETE FROM kv WHERE key = $1", [key]);
    },
  };

  // Add events methods if needed
  if (withEvents) {
    instance.getEvents = async (payload = {}) => {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      const { since } = payload;

      let query = "SELECT type, payload FROM events";
      let params = [];

      if (since !== undefined) {
        query += " WHERE id > $1";
        params.push(since);
      }

      query += " ORDER BY id";

      const results = await db.select(query, params);
      return results.map((row) => ({
        type: row.type,
        payload: row.payload ? JSON.parse(row.payload) : null,
      }));
    };

    instance.appendEvent = async (event) => {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      await db.execute("INSERT INTO events (type, payload) VALUES (?, ?)", [
        event.type,
        JSON.stringify(event.payload),
      ]);
    };

    // Snapshot support for fast initialization
    instance.getSnapshot = async () => {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      const result = await db.select("SELECT value FROM kv WHERE key = $1", [
        "_eventsSnapshot",
      ]);
      if (result && result.length > 0) {
        try {
          return JSON.parse(result[0].value);
        } catch {
          return null;
        }
      }
      return null;
    };

    instance.setSnapshot = async (snapshot) => {
      if (!initialized)
        throw new Error("Db not initialized. Call init() first.");
      const jsonValue = JSON.stringify(snapshot);
      await db.execute(
        "INSERT OR REPLACE INTO kv (key, value) VALUES ($1, $2)",
        ["_eventsSnapshot", jsonValue],
      );
    };
  }

  return instance;
};
