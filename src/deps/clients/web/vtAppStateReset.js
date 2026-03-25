const APP_DB_NAME = "app";
const CLIENT_STORE_VERSION = "2";
const VT_RESET_FLAG = "RTGL_VT_RESET_APP_STATE";
const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const wait = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const shouldResetAppState = () => {
  if (typeof window === "undefined") return false;

  const flagValue = window[VT_RESET_FLAG];
  if (flagValue === true) return true;
  if (typeof flagValue === "number") return flagValue !== 0;
  if (typeof flagValue !== "string") return false;

  return TRUE_VALUES.has(flagValue.trim().toLowerCase());
};

const openDb = (name, version) =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

const buildClientStoreDbName = (projectId) => {
  return `routevn-collab-client:${CLIENT_STORE_VERSION}:${projectId}`;
};

const readProjectIds = async () => {
  let db;

  try {
    db = await openDb(APP_DB_NAME, 1);
    const projectEntries = await new Promise((resolve, reject) => {
      const transaction = db.transaction("kv", "readonly");
      const store = transaction.objectStore("kv");
      const request = store.get("projectEntries");

      request.onsuccess = (event) => {
        const result = event.target.result;
        if (!result?.value) {
          resolve([]);
          return;
        }

        try {
          resolve(JSON.parse(result.value) || []);
        } catch {
          resolve([]);
        }
      };
      request.onerror = (event) => reject(event.target.error);
    });

    if (!Array.isArray(projectEntries)) {
      return [];
    }

    return projectEntries
      .map((entry) => entry?.id)
      .filter(
        (projectId) => typeof projectId === "string" && projectId.length > 0,
      );
  } catch {
    return [];
  } finally {
    db?.close?.();
  }
};

const deleteDatabaseOnce = (name) =>
  new Promise((resolve) => {
    if (typeof name !== "string" || name.length === 0) {
      resolve(true);
      return;
    }

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => finish(true);
    request.onerror = () => finish(false);
    request.onblocked = () => finish(false);
  });

const deleteDatabase = async (name) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const deleted = await deleteDatabaseOnce(name);
    if (deleted) {
      return;
    }

    await wait(50 * (attempt + 1));
  }
};

const getDatabaseNames = async () => {
  const databaseNames = new Set([APP_DB_NAME]);
  const projectIds = await readProjectIds();

  projectIds.forEach((projectId) => {
    databaseNames.add(projectId);
    databaseNames.add(buildClientStoreDbName(projectId));
  });

  if (typeof indexedDB.databases === "function") {
    try {
      const databases = await indexedDB.databases();
      databases.forEach((database) => {
        if (typeof database?.name === "string" && database.name.length > 0) {
          databaseNames.add(database.name);
        }
      });
    } catch {}
  }

  return [...databaseNames];
};

export const resetWebAppStateForVisualTests = async () => {
  if (!shouldResetAppState()) {
    return false;
  }

  try {
    localStorage.clear();
  } catch {}

  try {
    sessionStorage.clear();
  } catch {}

  const databaseNames = await getDatabaseNames();
  for (const databaseName of databaseNames) {
    await deleteDatabase(databaseName);
  }

  return true;
};
