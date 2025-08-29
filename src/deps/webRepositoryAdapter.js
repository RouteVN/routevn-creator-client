// Web Repository Storage Adapter

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
