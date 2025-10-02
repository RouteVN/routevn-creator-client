import Database from "@tauri-apps/plugin-sql";

export const createKeyValueStore = async () => {
  // Initialize SQLite database for app data
  const db = await Database.load("sqlite:app.db");

  const initialize = async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ItemTable (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  };

  const get = async (key) => {
    const result = await db.select(
      "SELECT value FROM ItemTable WHERE key = $1",
      [key],
    );

    if (result && result.length > 0) {
      try {
        return JSON.parse(result[0].value);
      } catch {
        return result[0].value;
      }
    }
    return null;
  };

  const set = async (key, value) => {
    const jsonValue = JSON.stringify(value);
    await db.execute(
      "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ($1, $2)",
      [key, jsonValue],
    );
  };

  const remove = async (key) => {
    await db.execute("DELETE FROM ItemTable WHERE key = $1", [key]);
  };

  // Initialize on creation
  await initialize();

  return {
    get,
    set,
    remove,
  };
};
