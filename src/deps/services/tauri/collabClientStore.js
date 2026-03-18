import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { createLibsqlClientStore } from "insieme/client";

export const PROJECT_DB_NAME = "project.db";

const MATERIALIZED_VIEW_TABLE = "materialized_view_state";
const APP_STATE_TABLE = "app_state";
const storePromisesByDbPath = new Map();

const isReadQuery = (sql) => {
  const normalized = String(sql ?? "")
    .trim()
    .toUpperCase();
  return normalized.startsWith("SELECT") || normalized.startsWith("PRAGMA");
};

const parseStoredValue = (value) => {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const createLibsqlLikeClient = ({ runSelect, runExecute }) => {
  return {
    async execute({ sql, args } = {}) {
      const resolvedArgs = Array.isArray(args) ? args : [];

      if (isReadQuery(sql)) {
        const rows = await runSelect(sql, resolvedArgs);
        return {
          rows: Array.isArray(rows) ? rows : [],
          columns: [],
          rowsAffected: 0,
        };
      }

      const result = await runExecute(sql, resolvedArgs);
      return {
        rows: [],
        columns: [],
        rowsAffected: Number(result?.rowsAffected ?? result?.changes ?? 0),
      };
    },
  };
};

const toRepositoryEvent = (item, created) => ({
  id: item.id,
  partitions: Array.isArray(item.partitions)
    ? structuredClone(item.partitions)
    : [],
  projectId: item.projectId,
  userId: item.userId,
  type: item.type,
  schemaVersion: item.schemaVersion,
  payload: structuredClone(item.payload),
  meta: item.meta ? structuredClone(item.meta) : {},
  ...(created !== undefined ? { created } : {}),
});

const loadRepositoryEvents = async (store) => {
  const committed = await store._debug.getCommitted();
  const drafts = await store._debug.getDrafts();

  const events = committed.map((event) =>
    toRepositoryEvent(event, event.created),
  );

  for (const draft of drafts) {
    events.push(toRepositoryEvent(draft, draft.createdAt));
  }

  return events;
};

export const toBootstrappedCommittedEvent = (repositoryEvent, index) => ({
  ...structuredClone(repositoryEvent),
  committedId: index + 1,
  created: Number.isFinite(Number(repositoryEvent?.meta?.clientTs))
    ? Number(repositoryEvent.meta.clientTs)
    : index + 1,
});

export const createPersistedTauriProjectStore = async ({
  projectPath,
  materializedViews = [],
}) => {
  const dbPath = await join(projectPath, PROJECT_DB_NAME);
  const cachedStore = storePromisesByDbPath.get(dbPath);
  if (cachedStore) {
    return cachedStore;
  }

  const storePromise = (async () => {
    const db = await Database.load(`sqlite:${dbPath}`);

    let operationQueue = Promise.resolve();
    const queueStoreOperation = async (operation) => {
      const nextOperation = operationQueue.then(operation);
      operationQueue = nextOperation.catch(() => {});
      return nextOperation;
    };
    const runSelect = (sql, args = []) =>
      db.select(sql, Array.isArray(args) ? args : []);
    const runExecute = (sql, args = []) =>
      db.execute(sql, Array.isArray(args) ? args : []);

    const store = createLibsqlClientStore(
      createLibsqlLikeClient({
        runSelect,
        runExecute,
      }),
      {
        materializedViews,
      },
    );

    await store.init();

    return {
      ...store,

      async init() {
        return queueStoreOperation(() => store.init());
      },

      async loadCursor() {
        return queueStoreOperation(() => store.loadCursor());
      },

      async insertDraft(payload) {
        return queueStoreOperation(() => store.insertDraft(payload));
      },

      async insertDrafts(items) {
        return queueStoreOperation(() => store.insertDrafts(items));
      },

      async loadDraftsOrdered() {
        return queueStoreOperation(() => store.loadDraftsOrdered());
      },

      async applySubmitResult(payload) {
        return queueStoreOperation(() => store.applySubmitResult(payload));
      },

      async applyCommittedBatch(payload) {
        return queueStoreOperation(() => store.applyCommittedBatch(payload));
      },

      async loadMaterializedView(payload) {
        return queueStoreOperation(() => store.loadMaterializedView(payload));
      },

      async loadMaterializedViews(payload) {
        return queueStoreOperation(() => store.loadMaterializedViews(payload));
      },

      async evictMaterializedView(payload) {
        return queueStoreOperation(() => store.evictMaterializedView(payload));
      },

      async invalidateMaterializedView(payload) {
        return queueStoreOperation(() =>
          store.invalidateMaterializedView(payload),
        );
      },

      async flushMaterializedViews() {
        return queueStoreOperation(() => store.flushMaterializedViews());
      },

      async getEvents(payload = {}) {
        const events = await queueStoreOperation(() =>
          loadRepositoryEvents(store),
        );
        const since = Number(payload?.since);
        if (!Number.isFinite(since) || since <= 0) {
          return events;
        }
        return events.slice(Math.floor(since));
      },

      async appendEvent() {},

      async clearEvents() {
        await queueStoreOperation(async () => {
          await runExecute("DELETE FROM committed_events");
          await runExecute("DELETE FROM local_drafts");
        });
      },

      async loadMaterializedViewCheckpoint({ viewName, partition }) {
        return queueStoreOperation(async () => {
          const rows = await runSelect(
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
        });
      },

      async saveMaterializedViewCheckpoint({
        viewName,
        partition,
        viewVersion,
        lastCommittedId,
        value,
        updatedAt,
      }) {
        await queueStoreOperation(() =>
          runExecute(
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
          ),
        );
      },

      async deleteMaterializedViewCheckpoint({ viewName, partition }) {
        await queueStoreOperation(() =>
          runExecute(
            `DELETE FROM ${MATERIALIZED_VIEW_TABLE}
           WHERE view_name = $1 AND partition = $2`,
            [viewName, partition],
          ),
        );
      },

      async clearMaterializedViewCheckpoints() {
        await queueStoreOperation(() =>
          runExecute(`DELETE FROM ${MATERIALIZED_VIEW_TABLE}`),
        );
      },

      app: {
        get: async (key) => {
          return queueStoreOperation(async () => {
            const rows = await runSelect(
              `SELECT value FROM ${APP_STATE_TABLE} WHERE key = $1`,
              [key],
            );
            const row = Array.isArray(rows) ? rows[0] : undefined;
            return parseStoredValue(row?.value);
          });
        },

        set: async (key, value) => {
          await queueStoreOperation(() =>
            runExecute(
              `INSERT OR REPLACE INTO ${APP_STATE_TABLE} (key, value) VALUES ($1, $2)`,
              [key, JSON.stringify(value)],
            ),
          );
        },

        remove: async (key) => {
          await queueStoreOperation(() =>
            runExecute(`DELETE FROM ${APP_STATE_TABLE} WHERE key = $1`, [key]),
          );
        },
      },

      _debug: {
        getDrafts: async () =>
          queueStoreOperation(() => store._debug.getDrafts()),
        getCommitted: async () =>
          queueStoreOperation(() => store._debug.getCommitted()),
        getCursor: async () =>
          queueStoreOperation(() => store._debug.getCursor()),
      },

      async close() {
        storePromisesByDbPath.delete(dbPath);
        await db.close();
      },
    };
  })();

  storePromisesByDbPath.set(dbPath, storePromise);
  return storePromise;
};
