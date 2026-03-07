import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";

const REPOSITORY_EVENTS_TABLE = "events";
const MATERIALIZED_VIEW_TABLE = "materialized_view_state";

const hasTable = async (db, tableName) => {
  const rows = await db.select(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = $1",
    [tableName],
  );
  return Array.isArray(rows) && rows.length > 0;
};

const getTableColumns = async (db, tableName) => {
  if (!(await hasTable(db, tableName))) {
    return [];
  }
  return (await db.select(`PRAGMA table_info(${tableName})`)) || [];
};

const ensureRepositorySchema = async (db) => {
  const eventColumns = await getTableColumns(db, REPOSITORY_EVENTS_TABLE);
  const hasLegacyTypeColumn = eventColumns.some(
    (column) => column?.name === "type",
  );

  if (eventColumns.length === 0) {
    await db.execute(`CREATE TABLE IF NOT EXISTS ${REPOSITORY_EVENTS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  } else if (hasLegacyTypeColumn) {
    await db.execute(
      `ALTER TABLE ${REPOSITORY_EVENTS_TABLE} RENAME TO ${REPOSITORY_EVENTS_TABLE}_legacy`,
    );
    await db.execute(`CREATE TABLE ${REPOSITORY_EVENTS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.execute(
      `INSERT INTO ${REPOSITORY_EVENTS_TABLE} (id, payload, created_at)
       SELECT id, payload, created_at
       FROM ${REPOSITORY_EVENTS_TABLE}_legacy
       ORDER BY id`,
    );
    await db.execute(`DROP TABLE ${REPOSITORY_EVENTS_TABLE}_legacy`);
  }

  await db.execute(`CREATE TABLE IF NOT EXISTS app (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS ${MATERIALIZED_VIEW_TABLE} (
    view_name TEXT NOT NULL,
    partition TEXT NOT NULL,
    view_version TEXT NOT NULL,
    last_committed_id INTEGER NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (view_name, partition)
  )`);
};

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

  await ensureRepositorySchema(db);

  return {
    // Insieme store interface
    async getEvents(payload = {}) {
      const { since } = payload;

      let query = `SELECT payload FROM ${REPOSITORY_EVENTS_TABLE}`;
      let params = [];

      if (since !== undefined) {
        query += " WHERE id > $1";
        params.push(since);
      }

      query += " ORDER BY id";

      const results = await db.select(query, params);
      return results.map((row) => {
        if (typeof row.payload !== "string" || row.payload.length === 0) {
          throw new Error("Repository event row is missing payload");
        }
        return JSON.parse(row.payload);
      });
    },

    async appendEvent(event) {
      await db.execute(
        `INSERT INTO ${REPOSITORY_EVENTS_TABLE} (payload) VALUES (?)`,
        [JSON.stringify(event)],
      );
    },

    async loadMaterializedViewCheckpoint({ viewName, partition }) {
      const rows = await db.select(
        `SELECT view_version, last_committed_id, value, updated_at
         FROM ${MATERIALIZED_VIEW_TABLE}
         WHERE view_name = $1 AND partition = $2`,
        [viewName, partition],
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row) return undefined;
      return {
        viewVersion: row.view_version,
        lastCommittedId: Number(row.last_committed_id) || 0,
        value: row.value ? JSON.parse(row.value) : undefined,
        updatedAt: Number(row.updated_at) || 0,
      };
    },

    async saveMaterializedViewCheckpoint({
      viewName,
      partition,
      viewVersion,
      lastCommittedId,
      value,
      updatedAt,
    }) {
      await db.execute(
        `INSERT OR REPLACE INTO ${MATERIALIZED_VIEW_TABLE}
         (view_name, partition, view_version, last_committed_id, value, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          viewName,
          partition,
          viewVersion,
          lastCommittedId,
          JSON.stringify(value),
          updatedAt,
        ],
      );
    },

    async deleteMaterializedViewCheckpoint({ viewName, partition }) {
      await db.execute(
        `DELETE FROM ${MATERIALIZED_VIEW_TABLE}
         WHERE view_name = $1 AND partition = $2`,
        [viewName, partition],
      );
    },

    // App key-value methods used by project services
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
