import Database from "@tauri-apps/plugin-sql";
import { encode, decode } from "@msgpack/msgpack";

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
      // Decode from Base64 string to Uint8Array, then decode MessagePack
      const binaryString = atob(result[0].value);
      const binaryData = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        binaryData[i] = binaryString.charCodeAt(i);
      }
      return decode(binaryData);
    }
    return null;
  };

  const set = async (key, value) => {
    // Encode to MessagePack, then convert to Base64 string for storage
    const binaryData = encode(value);
    let binaryString = "";
    for (let i = 0; i < binaryData.length; i++) {
      binaryString += String.fromCharCode(binaryData[i]);
    }
    const base64Value = btoa(binaryString);
    await db.execute(
      "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ($1, $2)",
      [key, base64Value],
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
