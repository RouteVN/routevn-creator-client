import Database from "@tauri-apps/plugin-sql";
import { encode, decode } from "@msgpack/msgpack";

export const createKeyValueStore = async () => {
  // Initialize SQLite database for app data
  const db = await Database.load("sqlite:app.db");

  const initialize = async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ItemTable (
        key TEXT PRIMARY KEY,
        value BLOB
      )
    `);
  };

  const get = async (key) => {
    const result = await db.select(
      "SELECT value FROM ItemTable WHERE key = $1",
      [key],
    );

    if (result && result.length > 0) {
      // Tauri SQL returns JSON array as string, parse it first
      const numberArray = JSON.parse(result[0].value);
      const binaryData = new Uint8Array(numberArray);
      return decode(binaryData);
    }
    return null;
  };

  const set = async (key, value) => {
    // Encode to MessagePack and store directly as Uint8Array
    const binaryData = encode(value);
    await db.execute(
      "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ($1, $2)",
      [key, binaryData],
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
