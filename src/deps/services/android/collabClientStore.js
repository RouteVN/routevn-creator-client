import { createLibsqlClientStore } from "insieme/client";
import { createAndroidSqliteConnection } from "../../clients/android/sqlite.js";
import { assertSafeAndroidStorageSegment } from "../../clients/android/storagePaths.js";
import {
  areRepositoryHistoryStatsEqual,
  getRepositoryHistoryLength,
  loadCommittedEventsFromClientStore,
  loadDraftEventsFromClientStore,
  normalizeRepositoryHistoryStats,
} from "../shared/collab/clientStoreHistory.js";

export const PROJECT_DB_NAME = "project.db";

const MATERIALIZED_VIEW_TABLE = "materialized_view_state";
const APP_STATE_TABLE = "app_state";
const storePromisesByProjectId = new Map();
const ROUTEVN_CHECKPOINT_ENVELOPE_KEY = "__routevnCheckpoint";
const ROUTEVN_CHECKPOINT_ENVELOPE_VERSION = 1;

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

const decodeStoredCheckpointValue = (rawValue) => {
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    return {
      value: undefined,
      meta: undefined,
    };
  }

  const parsedValue = JSON.parse(rawValue);
  const envelope = parsedValue?.[ROUTEVN_CHECKPOINT_ENVELOPE_KEY];

  if (
    envelope &&
    typeof envelope === "object" &&
    !Array.isArray(envelope) &&
    envelope.version === ROUTEVN_CHECKPOINT_ENVELOPE_VERSION
  ) {
    return {
      value: envelope.value,
      meta:
        envelope.meta &&
        typeof envelope.meta === "object" &&
        !Array.isArray(envelope.meta)
          ? envelope.meta
          : undefined,
    };
  }

  return {
    value: parsedValue,
    meta: undefined,
  };
};

const encodeStoredCheckpointValue = ({ value, meta } = {}) => {
  if (
    !meta ||
    typeof meta !== "object" ||
    Array.isArray(meta) ||
    Object.keys(meta).length === 0
  ) {
    return JSON.stringify(value === undefined ? null : value);
  }

  return JSON.stringify({
    [ROUTEVN_CHECKPOINT_ENVELOPE_KEY]: {
      version: ROUTEVN_CHECKPOINT_ENVELOPE_VERSION,
      value: value === undefined ? null : value,
      meta: structuredClone(meta),
    },
  });
};

const toMaterializedViewCheckpoint = (row) => {
  const decodedValue = decodeStoredCheckpointValue(row.value);

  return {
    partition: row.partition,
    viewVersion: row.view_version,
    lastCommittedId: Number(row.last_committed_id) || 0,
    value: decodedValue.value,
    meta: decodedValue.meta,
    updatedAt: Number(row.updated_at) || 0,
  };
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

export const evictPersistedAndroidProjectStoreCache = async ({
  projectId,
} = {}) => {
  if (!projectId) {
    return;
  }

  const cachedStorePromise = storePromisesByProjectId.get(projectId);
  storePromisesByProjectId.delete(projectId);
  if (!cachedStorePromise) {
    return;
  }

  const cachedStore = await cachedStorePromise.catch(() => undefined);
  await cachedStore?.close?.();
};

export const createPersistedAndroidProjectStore = async ({
  projectId,
  materializedViews = [],
}) => {
  if (!projectId) {
    throw new Error("projectId is required for Android project storage");
  }

  const cachedStore = storePromisesByProjectId.get(projectId);
  if (cachedStore) {
    return cachedStore;
  }

  const storePromise = (async () => {
    const safeProjectId = assertSafeAndroidStorageSegment(projectId, {
      label: "Android project id",
    });
    const dbPath = `projects/${safeProjectId}/${PROJECT_DB_NAME}`;
    const db = createAndroidSqliteConnection({ dbPath });
    await db.init();

    let operationQueue = Promise.resolve();
    const queueStoreOperation = async (operation) => {
      const nextOperation = operationQueue.then(async () => operation());
      operationQueue = nextOperation.catch(() => {});
      return nextOperation;
    };
    const queueWriteOperation = async (operation) =>
      queueStoreOperation(operation);
    const runSelect = (sql, args = []) => db.select(sql, args);
    const runExecute = (sql, args = []) => db.execute(sql, args);

    const store = createLibsqlClientStore(
      createLibsqlLikeClient({
        runSelect,
        runExecute,
      }),
      {
        materializedViews,
        applyPragmas: true,
        journalMode: "WAL",
        synchronous: "FULL",
        busyTimeoutMs: 5000,
      },
    );

    await store.init();

    const loadRepositoryHistoryStats = async () => {
      const committedRows = await runSelect(
        `SELECT COUNT(*) AS committedCount, COALESCE(MAX(committed_id), 0) AS latestCommittedId
         FROM committed_events`,
      );
      const draftRows = await runSelect(
        `SELECT COUNT(*) AS draftCount, COALESCE(MAX(draft_clock), 0) AS latestDraftClock
         FROM local_drafts`,
      );
      const committedRow = Array.isArray(committedRows)
        ? committedRows[0]
        : undefined;
      const draftRow = Array.isArray(draftRows) ? draftRows[0] : undefined;

      return normalizeRepositoryHistoryStats({
        committedCount: committedRow?.committedCount,
        latestCommittedId: committedRow?.latestCommittedId,
        draftCount: draftRow?.draftCount,
        latestDraftClock: draftRow?.latestDraftClock,
      });
    };

    return {
      ...store,

      async init() {
        return queueStoreOperation(() => store.init());
      },

      async insertDraft(payload) {
        return queueWriteOperation(() => store.insertDraft(payload));
      },

      async insertDrafts(items) {
        return queueWriteOperation(async () => {
          const normalizedItems = Array.isArray(items)
            ? items.filter(Boolean)
            : [];
          for (const item of normalizedItems) {
            await store.insertDraft(item);
          }
        });
      },

      async loadDraftsOrdered() {
        return queueStoreOperation(() => store.loadDraftsOrdered());
      },

      async applySubmitResult(payload) {
        return queueWriteOperation(() => store.applySubmitResult(payload));
      },

      async applyCommittedBatch(payload) {
        return queueWriteOperation(() => store.applyCommittedBatch(payload));
      },

      async loadMaterializedView(payload) {
        return queueStoreOperation(() => store.loadMaterializedView(payload));
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

      async clearEvents() {
        await queueWriteOperation(async () => {
          await runExecute("DELETE FROM committed_events");
          await runExecute("DELETE FROM local_drafts");
        });
      },

      async loadMaterializedViewCheckpoint({ viewName, partition }) {
        return queueStoreOperation(async () => {
          const rows = await runSelect(
            `SELECT view_version, last_committed_id, value, updated_at
             FROM ${MATERIALIZED_VIEW_TABLE}
             WHERE view_name = ? AND partition = ?`,
            [viewName, partition],
          );
          const row = Array.isArray(rows) ? rows[0] : undefined;
          if (!row) return undefined;
          return toMaterializedViewCheckpoint({
            ...row,
            partition,
          });
        });
      },

      async loadMaterializedViewCheckpoints({ viewName, partitions = [] }) {
        return queueStoreOperation(async () => {
          const normalizedPartitions = (partitions || []).filter(
            (partition) =>
              typeof partition === "string" && partition.length > 0,
          );
          if (normalizedPartitions.length === 0) {
            return [];
          }

          const placeholders = normalizedPartitions.map(() => "?").join(", ");
          const rows = await runSelect(
            `SELECT partition, view_version, last_committed_id, value, updated_at
             FROM ${MATERIALIZED_VIEW_TABLE}
             WHERE view_name = ? AND partition IN (${placeholders})`,
            [viewName, ...normalizedPartitions],
          );

          return Array.isArray(rows)
            ? rows.map(toMaterializedViewCheckpoint)
            : [];
        });
      },

      async saveMaterializedViewCheckpoint({
        viewName,
        partition,
        viewVersion,
        lastCommittedId,
        value,
        meta,
        updatedAt,
      }) {
        await queueWriteOperation(async () => {
          const checkpointMeta = {
            ...(meta && typeof meta === "object" && !Array.isArray(meta)
              ? structuredClone(meta)
              : {}),
            historyStats: await loadRepositoryHistoryStats(),
          };

          return runExecute(
            `INSERT OR REPLACE INTO ${MATERIALIZED_VIEW_TABLE}
             (view_name, partition, view_version, last_committed_id, value, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              viewName,
              partition,
              viewVersion,
              lastCommittedId,
              encodeStoredCheckpointValue({
                value,
                meta: checkpointMeta,
              }),
              updatedAt,
            ],
          );
        });
      },

      async deleteMaterializedViewCheckpoint({ viewName, partition }) {
        await queueWriteOperation(() =>
          runExecute(
            `DELETE FROM ${MATERIALIZED_VIEW_TABLE}
             WHERE view_name = ? AND partition = ?`,
            [viewName, partition],
          ),
        );
      },

      async clearMaterializedViewCheckpoints() {
        await queueWriteOperation(() =>
          runExecute(`DELETE FROM ${MATERIALIZED_VIEW_TABLE}`),
        );
      },

      app: {
        get: async (key) => {
          return queueStoreOperation(async () => {
            const rows = await runSelect(
              `SELECT value FROM ${APP_STATE_TABLE} WHERE key = ?`,
              [key],
            );
            const row = Array.isArray(rows) ? rows[0] : undefined;
            return parseStoredValue(row?.value);
          });
        },

        set: async (key, value) => {
          await queueWriteOperation(() =>
            runExecute(
              `INSERT OR REPLACE INTO ${APP_STATE_TABLE} (key, value) VALUES (?, ?)`,
              [key, JSON.stringify(value)],
            ),
          );
        },

        remove: async (key) => {
          await queueWriteOperation(() =>
            runExecute(`DELETE FROM ${APP_STATE_TABLE} WHERE key = ?`, [key]),
          );
        },
      },

      async listDraftsOrdered() {
        return queueStoreOperation(() => store.listDraftsOrdered());
      },

      async listCommitted() {
        return queueStoreOperation(() => store.listCommitted());
      },

      async listCommittedAfter(payload = {}) {
        return queueStoreOperation(() => store.listCommittedAfter(payload));
      },

      async getCursor() {
        return queueStoreOperation(() => store.getCursor());
      },

      async getRepositoryHistoryStats() {
        return queueStoreOperation(() => loadRepositoryHistoryStats());
      },

      isRepositoryHistoryStatsEqual(left, right) {
        return areRepositoryHistoryStatsEqual(left, right);
      },

      getRepositoryHistoryLength(stats) {
        return getRepositoryHistoryLength(stats);
      },

      async close() {
        storePromisesByProjectId.delete(projectId);
        await queueStoreOperation(async () => {
          await store.flushMaterializedViews();
          await db.close();
        });
      },
    };
  })();

  storePromisesByProjectId.set(projectId, storePromise);
  return storePromise;
};

export const loadRepositoryHistoryStatsFromClientStore = async (store) => {
  const committedEvents = await loadCommittedEventsFromClientStore(store);
  const draftEvents = await loadDraftEventsFromClientStore(store);
  const latestCommittedId = Number(committedEvents.at(-1)?.committedId) || 0;
  const latestDraftClock = Number(draftEvents.at(-1)?.draftClock) || 0;

  return normalizeRepositoryHistoryStats({
    committedCount: committedEvents.length,
    latestCommittedId,
    draftCount: draftEvents.length,
    latestDraftClock,
  });
};
