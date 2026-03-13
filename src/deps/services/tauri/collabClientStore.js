import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { createLibsqlClientStore } from "insieme/client";

const COLLAB_CLIENT_DB_NAME = "collab-client.db";

const isReadQuery = (sql) => {
  const normalized = String(sql || "")
    .trim()
    .toUpperCase();
  return normalized.startsWith("SELECT") || normalized.startsWith("PRAGMA");
};

const createLibsqlLikeClient = (db) => ({
  async execute({ sql, args } = {}) {
    const resolvedArgs = Array.isArray(args) ? args : [];

    if (isReadQuery(sql)) {
      const rows = await db.select(sql, resolvedArgs);
      return {
        rows: Array.isArray(rows) ? rows : [],
        columns: [],
        rowsAffected: 0,
      };
    }

    const result = await db.execute(sql, resolvedArgs);
    return {
      rows: [],
      columns: [],
      rowsAffected: Number(result?.rowsAffected ?? result?.changes ?? 0),
    };
  },
});

export const createPersistedTauriCollabClientStore = async ({
  projectPath,
  materializedViews = [],
}) => {
  const dbPath = await join(projectPath, COLLAB_CLIENT_DB_NAME);
  const db = await Database.load(`sqlite:${dbPath}`);
  const store = createLibsqlClientStore(createLibsqlLikeClient(db), {
    materializedViews,
  });
  await store.init();
  return store;
};
