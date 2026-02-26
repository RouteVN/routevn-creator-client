import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";

/**
 * Insieme-compatible Tauri SQLite Store Adapter
 * @param {string} projectPath - Required project path for project-specific database
 */
export const createInsiemeTauriStoreAdapter = async (projectPath) => {
  if (!projectPath) {
    throw new Error(
      "Project path is required. Database must be stored in project folder.",
    );
  }

  const dbPath = await join(projectPath, "repository.db");
  const db = await Database.load(`sqlite:${dbPath}`);

  await db.execute(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS app (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  return {
    // Insieme store interface
    async getEvents(payload = {}) {
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
    },

    async appendTypedEvent(event) {
      await db.execute("INSERT INTO events (type, payload) VALUES (?, ?)", [
        event.type,
        JSON.stringify(event.payload),
      ]);
    },

    // Preserve app methods for compatibility
    app: {
      get: async (key) => {
        const result = await db.select("SELECT value FROM app WHERE key = $1", [
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
      set: async (key, value) => {
        const jsonValue = JSON.stringify(value);
        await db.execute(
          "INSERT OR REPLACE INTO app (key, value) VALUES ($1, $2)",
          [key, jsonValue],
        );
      },
      remove: async (key) => {
        await db.execute("DELETE FROM app WHERE key = $1", [key]);
      },
    },
  };
};
