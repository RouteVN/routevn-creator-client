import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { createLibsqlClientStore } from "insieme/client";
import { Subject, asyncScheduler, throttleTime } from "rxjs";
import {
  SQLITE_BUSY_TIMEOUT_MS,
  isSqliteNoActiveTransactionError,
  withSqliteLockRetry,
} from "../../../internal/sqliteLocking.js";

export const PROJECT_DB_NAME = "project.db";

const MATERIALIZED_VIEW_TABLE = "materialized_view_state";
const APP_STATE_TABLE = "app_state";
const storePromisesByDbPath = new Map();
const SQL_BYTES_TYPE_KEY = "__routevn_sql_type";
const SQL_BYTES_TYPE_VALUE = "bytes";
const SQL_BYTES_DATA_KEY = "data";
const WAL_CHECKPOINT_THROTTLE_MS = 20000;

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

const isByteNumber = (value) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 255;

const toUint8Array = (value) => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value) && value.every(isByteNumber)) {
    return Uint8Array.from(value);
  }

  if (
    value &&
    typeof value === "object" &&
    value.type === "Buffer" &&
    Array.isArray(value.data) &&
    value.data.every(isByteNumber)
  ) {
    return Uint8Array.from(value.data);
  }

  if (
    value &&
    typeof value === "object" &&
    Array.isArray(value.bytes) &&
    value.bytes.every(isByteNumber)
  ) {
    return Uint8Array.from(value.bytes);
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (
      keys.length > 0 &&
      keys.every((key) => /^\d+$/.test(key)) &&
      keys.every((key) => isByteNumber(value[key]))
    ) {
      return Uint8Array.from(
        keys
          .map((key) => Number(key))
          .sort((a, b) => a - b)
          .map((key) => value[key]),
      );
    }
  }

  return null;
};

const normalizeSqlValue = (value) => {
  const bytes = toUint8Array(value);
  return bytes || value;
};

const toMaterializedViewCheckpoint = (row) => ({
  partition: row.partition,
  viewVersion: row.view_version,
  lastCommittedId: Number(row.last_committed_id) || 0,
  value: row.value ? JSON.parse(row.value) : undefined,
  updatedAt: Number(row.updated_at) || 0,
});

const normalizeSqlRow = (row) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return row;
  }

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeSqlValue(value)]),
  );
};

const normalizeSqlArg = (value) => {
  const bytes = toUint8Array(value);
  if (bytes) {
    return {
      [SQL_BYTES_TYPE_KEY]: SQL_BYTES_TYPE_VALUE,
      [SQL_BYTES_DATA_KEY]: [...bytes],
    };
  }
  return value;
};

const isSqliteCommitStatement = (sql) =>
  /^COMMIT\b/.test(
    String(sql ?? "")
      .trim()
      .toUpperCase(),
  );

export const executeTauriSqlStatement = async ({
  db,
  sql,
  args = [],
  retryDelaysMs,
} = {}) => {
  const resolvedArgs = Array.isArray(args) ? args : [];
  return withSqliteLockRetry(
    () => db.execute(sql, resolvedArgs),
    isSqliteCommitStatement(sql)
      ? {
          retryDelaysMs,
          shouldRecoverError: (error, { sawLock }) =>
            sawLock && isSqliteNoActiveTransactionError(error),
          recoverValue: { rowsAffected: 0 },
        }
      : {
          retryDelaysMs,
        },
  );
};

const createLibsqlLikeClient = ({ runSelect, runExecute }) => {
  return {
    async execute({ sql, args } = {}) {
      const resolvedArgs = Array.isArray(args) ? args.map(normalizeSqlArg) : [];

      if (isReadQuery(sql)) {
        const rows = await runSelect(sql, resolvedArgs);
        return {
          rows: Array.isArray(rows) ? rows.map(normalizeSqlRow) : [],
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

const toRepositoryEvent = (item, { created, projectId } = {}) => {
  if (typeof item?.partition !== "string" || item.partition.length === 0) {
    throw new Error("Stored collab row is missing partition");
  }

  const resolvedProjectId =
    typeof item?.projectId === "string" && item.projectId.length > 0
      ? item.projectId
      : projectId;

  if (typeof resolvedProjectId !== "string" || resolvedProjectId.length === 0) {
    throw new Error("Stored collab row is missing projectId");
  }

  return {
    id: item.id,
    partition: item.partition,
    projectId: resolvedProjectId,
    userId: item.userId,
    type: item.type,
    schemaVersion: item.schemaVersion,
    payload: structuredClone(item.payload),
    clientTs: Number.isFinite(Number(item?.clientTs))
      ? Number(item.clientTs)
      : Number.isFinite(Number(item?.meta?.clientTs))
        ? Number(item.meta.clientTs)
        : undefined,
    meta: item.meta ? structuredClone(item.meta) : {},
    ...(created !== undefined ? { serverTs: created } : {}),
  };
};

const assertRepositoryEventShape = (event) => {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("Reconstructed repository event is invalid");
  }
  if (typeof event.partition !== "string" || event.partition.length === 0) {
    throw new Error(
      `Reconstructed repository event is missing partition: ${JSON.stringify({
        id: event?.id,
        projectId: event?.projectId,
        type: event?.type,
        schemaVersion: event?.schemaVersion,
        keys:
          event && typeof event === "object" && !Array.isArray(event)
            ? Object.keys(event)
            : [],
      })}`,
    );
  }
  if (typeof event.projectId !== "string" || event.projectId.length === 0) {
    throw new Error(
      `Reconstructed repository event is missing projectId: ${JSON.stringify({
        id: event?.id,
        partition: event?.partition,
        type: event?.type,
        schemaVersion: event?.schemaVersion,
      })}`,
    );
  }
  if (typeof event.type !== "string" || event.type.length === 0) {
    throw new Error(
      `Reconstructed repository event is missing type: ${JSON.stringify({
        id: event?.id,
        partition: event?.partition,
        projectId: event?.projectId,
      })}`,
    );
  }
  if (
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  ) {
    throw new Error(
      `Reconstructed repository event has invalid payload: ${JSON.stringify({
        id: event?.id,
        partition: event?.partition,
        projectId: event?.projectId,
        type: event?.type,
        payloadType: Array.isArray(event?.payload)
          ? "array"
          : typeof event?.payload,
      })}`,
    );
  }
};

const loadRepositoryEvents = async ({ store, projectId }) => {
  const committed = await store._debug.getCommitted();
  const drafts = await store._debug.getDrafts();

  const events = committed.map((event) =>
    toRepositoryEvent(event, {
      created: event.serverTs,
      projectId,
    }),
  );

  for (const draft of drafts) {
    events.push(
      toRepositoryEvent(draft, {
        created: draft.createdAt,
        projectId,
      }),
    );
  }

  events.forEach(assertRepositoryEventShape);

  return events;
};

export const toBootstrappedCommittedEvent = (repositoryEvent, index) => ({
  ...structuredClone(repositoryEvent),
  committedId: index + 1,
  clientTs: Number.isFinite(Number(repositoryEvent?.clientTs))
    ? Number(repositoryEvent.clientTs)
    : Number.isFinite(Number(repositoryEvent?.meta?.clientTs))
      ? Number(repositoryEvent.meta.clientTs)
      : index + 1,
  serverTs: Number.isFinite(Number(repositoryEvent?.clientTs))
    ? Number(repositoryEvent.clientTs)
    : Number.isFinite(Number(repositoryEvent?.meta?.clientTs))
      ? Number(repositoryEvent.meta.clientTs)
      : index + 1,
});

export const createPersistedTauriProjectStore = async ({
  projectPath,
  projectId,
  materializedViews = [],
}) => {
  const dbPath = await join(projectPath, PROJECT_DB_NAME);
  const cachedStore = storePromisesByDbPath.get(dbPath);
  if (cachedStore) {
    return cachedStore;
  }

  const storePromise = (async () => {
    const db = await Database.load(`sqlite:${dbPath}`);
    await withSqliteLockRetry(() =>
      db.execute(`PRAGMA busy_timeout=${SQLITE_BUSY_TIMEOUT_MS}`),
    );

    let operationQueue = Promise.resolve();
    const queueStoreOperation = async (operation) => {
      const nextOperation = operationQueue.then(operation);
      operationQueue = nextOperation.catch(() => {});
      return nextOperation;
    };
    const runSelect = (sql, args = []) =>
      withSqliteLockRetry(() =>
        db.select(sql, Array.isArray(args) ? args : []),
      );
    const runExecute = (sql, args = []) =>
      executeTauriSqlStatement({
        db,
        sql,
        args,
      });
    let walDirty = false;
    let storeClosed = false;
    const walCheckpointRequests = new Subject();

    const checkpointWal = async (mode = "PASSIVE") => {
      const checkpointMode = mode === "TRUNCATE" ? "TRUNCATE" : "PASSIVE";
      await runSelect(`PRAGMA wal_checkpoint(${checkpointMode})`);
      walDirty = false;
    };

    const schedulePassiveWalCheckpoint = () => {
      if (storeClosed) {
        return;
      }
      walDirty = true;
      walCheckpointRequests.next();
    };

    const queueWriteOperation = async (operation) =>
      queueStoreOperation(async () => {
        const result = await operation();
        schedulePassiveWalCheckpoint();
        return result;
      });

    const walCheckpointSubscription = walCheckpointRequests
      .pipe(
        throttleTime(WAL_CHECKPOINT_THROTTLE_MS, asyncScheduler, {
          leading: false,
          trailing: true,
        }),
      )
      .subscribe(() => {
        if (storeClosed) {
          return;
        }
        void queueStoreOperation(async () => {
          if (storeClosed || !walDirty) {
            return;
          }
          await checkpointWal("PASSIVE");
        }).catch((error) => {
          console.warn("Failed to checkpoint SQLite WAL:", error);
        });
      });

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
        busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
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
        return queueWriteOperation(() => store.insertDraft(payload));
      },

      async insertDrafts(items) {
        return queueWriteOperation(() => store.insertDrafts(items));
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
        return queueStoreOperation(async () => {
          const result = await store.flushMaterializedViews();
          if (walDirty) {
            await checkpointWal("PASSIVE");
          }
          return result;
        });
      },

      async getEvents(payload = {}) {
        const events = await queueStoreOperation(() =>
          loadRepositoryEvents({
            store,
            projectId,
          }),
        );
        const since = Number(payload?.since);
        if (!Number.isFinite(since) || since <= 0) {
          return events;
        }
        return events.slice(Math.floor(since));
      },

      async appendEvent() {},

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
           WHERE view_name = $1 AND partition = $2`,
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

          const placeholders = normalizedPartitions
            .map((_, index) => `$${index + 2}`)
            .join(", ");
          const rows = await runSelect(
            `SELECT partition, view_version, last_committed_id, value, updated_at
           FROM ${MATERIALIZED_VIEW_TABLE}
           WHERE view_name = $1 AND partition IN (${placeholders})`,
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
        updatedAt,
      }) {
        await queueWriteOperation(() =>
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
        await queueWriteOperation(() =>
          runExecute(
            `DELETE FROM ${MATERIALIZED_VIEW_TABLE}
           WHERE view_name = $1 AND partition = $2`,
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
              `SELECT value FROM ${APP_STATE_TABLE} WHERE key = $1`,
              [key],
            );
            const row = Array.isArray(rows) ? rows[0] : undefined;
            return parseStoredValue(row?.value);
          });
        },

        set: async (key, value) => {
          await queueWriteOperation(() =>
            runExecute(
              `INSERT OR REPLACE INTO ${APP_STATE_TABLE} (key, value) VALUES ($1, $2)`,
              [key, JSON.stringify(value)],
            ),
          );
        },

        remove: async (key) => {
          await queueWriteOperation(() =>
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
        storeClosed = true;
        walCheckpointSubscription.unsubscribe();
        walCheckpointRequests.complete();
        await queueStoreOperation(async () => {
          await store.flushMaterializedViews();
          await checkpointWal("TRUNCATE");
        });
        await db.close();
      },
    };
  })();

  storePromisesByDbPath.set(dbPath, storePromise);
  return storePromise;
};
