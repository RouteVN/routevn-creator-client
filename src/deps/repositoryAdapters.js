// Repository Storage Adapters

/**
 * IndexedDB Repository Adapter for web environment
 */
export const createIndexeddbRepositoryAdapter = () => {
  const DB_NAME = "RouteVNRepository";
  const STORE_NAME = "actionStream";
  let db = null;

  const openDB = async () => {
    if (db) return db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { autoIncrement: true });
        }
      };
    });
  };

  return {
    async addAction(action) {
      const database = await openDB();
      const transaction = database.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.add(action);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    },

    async getAllEvents() {
      const database = await openDB();
      const transaction = database.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    },
  };
};

/**
 * Tauri SQLite Repository Adapter
 */
export const createTauriSQLiteRepositoryAdapter = async () => {
  // Dynamic import to avoid loading in non-Tauri environments
  const Database = (await import("@tauri-apps/plugin-sql")).default;

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
