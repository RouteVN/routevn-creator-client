import Database from "@tauri-apps/plugin-sql";

/**
 * Tauri SQLite Repository Adapter
 */
export const createTauriSQLiteRepositoryAdapter = async () => {
  // Initialize SQLite database
  const db = await Database.load("sqlite:repository.db");

  // Create actions table if it doesn't exist
  await db.execute(`
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      target TEXT,
      value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return {
    async addAction(action) {
      await db.execute(
        "INSERT INTO actions (action_type, target, value) VALUES ($1, $2, $3)",
        [action.actionType, action.target, JSON.stringify(action.value)],
      );
    },

    async getAllEvents() {
      const results = await db.select(
        "SELECT action_type, target, value FROM actions ORDER BY id",
      );
      return results.map((row) => ({
        actionType: row.action_type,
        target: row.target,
        value: row.value ? JSON.parse(row.value) : null,
      }));
    },
  };
};
