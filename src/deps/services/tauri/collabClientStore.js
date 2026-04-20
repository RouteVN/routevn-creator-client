import { join } from "@tauri-apps/api/path";
import { createLibsqlClientStore } from "insieme/client";
import { Subject, asyncScheduler, throttleTime } from "rxjs";
import {
  SQLITE_BUSY_TIMEOUT_MS,
  isSqliteLockError,
  isSqliteNoActiveTransactionError,
  withSqliteLockRetry,
} from "../../../internal/sqliteLocking.js";
import { getManagedSqliteConnection } from "../../clients/tauri/sqliteConnectionManager.js";
import {
  areRepositoryHistoryStatsEqual,
  getRepositoryHistoryLength,
  loadCommittedEventsFromClientStore,
  loadDraftEventsFromClientStore,
  loadRepositoryEventsFromClientStore,
  normalizeRepositoryHistoryStats,
} from "../shared/collab/clientStoreHistory.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
} from "../shared/projectRepositoryViews/shared.js";

export const PROJECT_DB_NAME = "project.db";

const MATERIALIZED_VIEW_TABLE = "materialized_view_state";
const APP_STATE_TABLE = "app_state";
const PROJECT_CREATE_COMMAND_TYPE = "project.create";
const storePromisesByDbPath = new Map();
const SQL_BYTES_TYPE_KEY = "__routevn_sql_type";
const SQL_BYTES_TYPE_VALUE = "bytes";
const SQL_BYTES_DATA_KEY = "data";
const WAL_CHECKPOINT_THROTTLE_MS = 10000;
const WAL_CHECKPOINT_RETRY_MS = 10000;
const ROUTEVN_CHECKPOINT_ENVELOPE_KEY = "__routevnCheckpoint";
const ROUTEVN_CHECKPOINT_ENVELOPE_VERSION = 1;
export const loadRepositoryEvents = loadRepositoryEventsFromClientStore;
export { toBootstrappedCommittedEvent } from "../shared/collab/clientStoreHistory.js";

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

const toFiniteCheckpointMetric = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.trunc(numericValue) : undefined;
};

const parseWalCheckpointResult = (rows) => {
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return {
      isBusy: false,
      logFrames: 0,
      checkpointedFrames: 0,
      complete: true,
    };
  }

  const metrics = Object.values(row)
    .map(toFiniteCheckpointMetric)
    .filter((value) => value !== undefined);
  const busyMetric = metrics[0] ?? 0;
  const logMetric = metrics[1] ?? 0;
  const checkpointedMetric = metrics[2] ?? 0;
  const hasWal =
    Number.isFinite(logMetric) &&
    logMetric >= 0 &&
    Number.isFinite(checkpointedMetric) &&
    checkpointedMetric >= 0;

  return {
    isBusy: busyMetric > 0,
    logFrames: hasWal ? logMetric : 0,
    checkpointedFrames: hasWal ? checkpointedMetric : 0,
    complete: busyMetric <= 0 && (!hasWal || logMetric === checkpointedMetric),
  };
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

export const evictPersistedTauriProjectStoreCache = async ({
  projectPath,
} = {}) => {
  if (!projectPath) {
    return;
  }

  const dbPath = await join(projectPath, PROJECT_DB_NAME);
  const cachedStorePromise = storePromisesByDbPath.get(dbPath);
  storePromisesByDbPath.delete(dbPath);

  if (!cachedStorePromise) {
    return;
  }

  try {
    const cachedStore = await cachedStorePromise;
    if (typeof cachedStore?.close === "function") {
      await cachedStore.close();
    }
  } catch {
    // best-effort eviction for stale/closed pooled handles
  }
};

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
  onRetry,
} = {}) => {
  const resolvedArgs = Array.isArray(args) ? args : [];
  return withSqliteLockRetry(
    () => db.execute(sql, resolvedArgs),
    isSqliteCommitStatement(sql)
      ? {
          retryDelaysMs,
          onRetry,
          shouldRecoverError: (error) =>
            isSqliteNoActiveTransactionError(error),
          recoverValue: { rowsAffected: 0 },
        }
      : {
          retryDelaysMs,
          onRetry,
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

const isBootstrapRepositoryEvent = (event) =>
  event?.type === PROJECT_CREATE_COMMAND_TYPE;

export const inspectBootstrapHistorySupport = ({
  committedEvents = [],
  draftEvents = [],
} = {}) => {
  const committed = Array.isArray(committedEvents)
    ? committedEvents.map((event) => structuredClone(event))
    : [];
  const drafts = Array.isArray(draftEvents)
    ? draftEvents.map((event) => structuredClone(event))
    : [];

  if (committed.length === 0 && drafts.length === 0) {
    return {
      supported: true,
      reason: "history_empty",
    };
  }

  const committedBootstrapIndexes = committed
    .map((event, index) => (isBootstrapRepositoryEvent(event) ? index : -1))
    .filter((index) => index >= 0);
  const draftBootstrapIndexes = drafts
    .map((event, index) => (isBootstrapRepositoryEvent(event) ? index : -1))
    .filter((index) => index >= 0);

  if (
    committedBootstrapIndexes.length === 1 &&
    committedBootstrapIndexes[0] === 0 &&
    draftBootstrapIndexes.length === 0
  ) {
    return {
      supported: true,
      reason: "history_valid",
    };
  }

  if (
    draftBootstrapIndexes.length === 1 &&
    draftBootstrapIndexes[0] === 0 &&
    committedBootstrapIndexes.length === 0
  ) {
    return {
      supported: true,
      reason: "history_valid",
    };
  }

  if (
    committedBootstrapIndexes.length > 1 ||
    draftBootstrapIndexes.length > 1 ||
    (committedBootstrapIndexes.length > 0 && draftBootstrapIndexes.length > 0)
  ) {
    return {
      supported: false,
      reason: "multiple_bootstrap_events",
    };
  }

  if (committedBootstrapIndexes.length === 1) {
    return {
      supported: false,
      reason: "misordered_bootstrap_committed_event",
    };
  }

  if (draftBootstrapIndexes.length === 1) {
    return {
      supported: false,
      reason: "misordered_bootstrap_draft_event",
    };
  }

  return {
    supported: false,
    reason: "missing_bootstrap_event",
  };
};

export const isCurrentMainCheckpointCompatibleWithHistory = ({
  checkpoint,
  historyStats,
} = {}) => {
  if (
    !checkpoint ||
    checkpoint.viewVersion !== MAIN_VIEW_VERSION ||
    !Number.isFinite(Number(checkpoint?.lastCommittedId))
  ) {
    return false;
  }

  const checkpointHistoryStats = checkpoint?.meta?.historyStats;
  const hasCheckpointHistoryStats =
    checkpointHistoryStats &&
    typeof checkpointHistoryStats === "object" &&
    !Array.isArray(checkpointHistoryStats);

  if (hasCheckpointHistoryStats) {
    return areRepositoryHistoryStatsEqual(checkpointHistoryStats, historyStats);
  }

  const checkpointRevision = Math.max(
    0,
    Math.floor(Number(checkpoint.lastCommittedId) || 0),
  );
  return checkpointRevision === getRepositoryHistoryLength(historyStats);
};

const createUnsupportedProjectHistoryError = ({ projectId, reason } = {}) => {
  let detail =
    "This project uses an unsupported local history format for this RouteVN Creator build.";

  if (reason === "misordered_bootstrap_draft_event") {
    detail =
      "This project stores its draft bootstrap event in the wrong draft position.";
  } else if (reason === "misordered_bootstrap_committed_event") {
    detail =
      "This project stores its bootstrap event in the wrong committed position.";
  } else if (reason === "multiple_bootstrap_events") {
    detail = "This project contains multiple bootstrap events.";
  } else if (reason === "missing_bootstrap_event") {
    detail = "This project is missing the required bootstrap event.";
  }

  const error = new Error(detail);
  error.name = "ProjectStoreFormatUnsupportedError";
  error.code = "project_store_format_unsupported";
  error.details = {
    projectId,
    reason,
  };
  return error;
};

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
    const db = getManagedSqliteConnection({
      dbPath: `sqlite:${dbPath}`,
      busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
    });
    await db.init();

    let operationQueue = Promise.resolve();
    const queueStoreOperation = async (labelOrOperation, maybeOperation) => {
      const operation =
        typeof labelOrOperation === "function"
          ? labelOrOperation
          : maybeOperation;
      const nextOperation = operationQueue.then(async () => operation());
      operationQueue = nextOperation.catch(() => {});
      return nextOperation;
    };
    const runSelect = (sql, args = []) =>
      withSqliteLockRetry(() =>
        db.select(sql, Array.isArray(args) ? args : []),
      );
    const runSelectNoRetry = (sql, args = []) =>
      db.select(sql, Array.isArray(args) ? args : []);
    const runExecute = (sql, args = []) =>
      executeTauriSqlStatement({
        db,
        sql,
        args,
      });
    let walDirty = false;
    let storeClosed = false;
    const walCheckpointRequests = new Subject();
    let walCheckpointRetryTimer;

    const clearWalCheckpointRetryTimer = () => {
      if (!walCheckpointRetryTimer) {
        return;
      }
      clearTimeout(walCheckpointRetryTimer);
      walCheckpointRetryTimer = undefined;
    };

    const checkpointWal = async (mode = "PASSIVE") => {
      const checkpointMode =
        mode === "TRUNCATE"
          ? "TRUNCATE"
          : mode === "RESTART"
            ? "RESTART"
            : "PASSIVE";
      try {
        const result = await runSelectNoRetry(
          `PRAGMA wal_checkpoint(${checkpointMode})`,
        );
        return parseWalCheckpointResult(result);
      } catch (error) {
        if (isSqliteLockError(error)) {
          return {
            isBusy: true,
            logFrames: 0,
            checkpointedFrames: 0,
            complete: false,
          };
        }
        throw error;
      }
    };

    const scheduleWalCheckpointRetry = () => {
      if (storeClosed || !walDirty || walCheckpointRetryTimer) {
        return;
      }

      walCheckpointRetryTimer = setTimeout(() => {
        walCheckpointRetryTimer = undefined;
        if (storeClosed || !walDirty) {
          return;
        }

        void queueStoreOperation("retryWalCheckpoint", flushWalIfNeeded).catch(
          (error) => {
            console.warn("Failed to retry SQLite WAL checkpoint:", error);
          },
        );
      }, WAL_CHECKPOINT_RETRY_MS);
    };

    const flushWalIfNeeded = async () => {
      if (storeClosed || !walDirty) {
        clearWalCheckpointRetryTimer();
        return;
      }

      const passiveCheckpoint = await checkpointWal("PASSIVE");
      if (!passiveCheckpoint.complete) {
        scheduleWalCheckpointRetry();
        return;
      }

      walDirty = false;
      clearWalCheckpointRetryTimer();
    };

    const schedulePassiveWalCheckpoint = () => {
      if (storeClosed) {
        return;
      }
      walDirty = true;
      clearWalCheckpointRetryTimer();
      walCheckpointRequests.next();
    };

    const queueWriteOperation = async (labelOrOperation, maybeOperation) => {
      const label =
        typeof labelOrOperation === "string" ? labelOrOperation : "anonymous";
      const operation =
        typeof labelOrOperation === "function"
          ? labelOrOperation
          : maybeOperation;
      return queueStoreOperation(label, async () => {
        const result = await operation();
        schedulePassiveWalCheckpoint();
        return result;
      });
    };

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
        void queueStoreOperation("flushWalIfNeeded", flushWalIfNeeded).catch(
          (error) => {
            console.warn("Failed to checkpoint SQLite WAL:", error);
          },
        );
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

    let projectHistorySupportPromise;
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
    const loadMainCheckpoint = async () => {
      const rows = await runSelect(
        `SELECT view_version, last_committed_id, value, updated_at
         FROM ${MATERIALIZED_VIEW_TABLE}
         WHERE view_name = $1 AND partition = $2`,
        [MAIN_VIEW_NAME, MAIN_PARTITION],
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row) {
        return undefined;
      }
      return toMaterializedViewCheckpoint({
        ...row,
        partition: MAIN_PARTITION,
      });
    };
    const ensureSupportedProjectHistory = async () => {
      if (projectHistorySupportPromise) {
        return projectHistorySupportPromise;
      }

      projectHistorySupportPromise = queueStoreOperation(
        "ensureSupportedProjectHistory",
        async () => {
          const committedEvents =
            await loadCommittedEventsFromClientStore(store);
          const draftEvents = await loadDraftEventsFromClientStore(store);
          const currentHistoryStats = await loadRepositoryHistoryStats();
          const support = inspectBootstrapHistorySupport({
            committedEvents,
            draftEvents,
          });

          if (support.supported) {
            return support;
          }

          if (
            support.reason === "missing_bootstrap_event" &&
            Number(currentHistoryStats?.committedCount || 0) === 0 &&
            Number(currentHistoryStats?.draftCount || 0) > 0
          ) {
            const checkpoint = await loadMainCheckpoint();
            if (
              isCurrentMainCheckpointCompatibleWithHistory({
                checkpoint,
                historyStats: currentHistoryStats,
              })
            ) {
              return {
                supported: true,
                reason: "history_valid_from_current_main_checkpoint",
              };
            }
          }

          console.warn("Unsupported project bootstrap history", {
            projectId,
            reason: support.reason,
            committedEventCountBefore: committedEvents.length,
            draftEventCountBefore: draftEvents.length,
          });
          throw createUnsupportedProjectHistoryError({
            projectId,
            reason: support.reason,
          });
        },
      ).catch((error) => {
        projectHistorySupportPromise = undefined;
        throw error;
      });

      return projectHistorySupportPromise;
    };

    await ensureSupportedProjectHistory();

    return {
      ...store,

      async init() {
        return queueStoreOperation("init", () => store.init());
      },

      async loadCursor() {
        return queueStoreOperation("loadCursor", () => store.loadCursor());
      },

      async insertDraft(payload) {
        return queueWriteOperation("insertDraft", () =>
          store.insertDraft(payload),
        );
      },

      async insertDrafts(items) {
        return queueWriteOperation("insertDrafts", async () => {
          const normalizedItems = Array.isArray(items)
            ? items.filter(Boolean)
            : [];
          if (normalizedItems.length === 0) {
            return undefined;
          }

          // plugin-sql does not guarantee a pinned connection across JS-issued
          // BEGIN/COMMIT batches. Sequential single inserts avoid the long
          // busy-timeout stalls we were seeing in insertDrafts().
          for (const item of normalizedItems) {
            await store.insertDraft(item);
          }
          return undefined;
        });
      },

      async loadDraftsOrdered() {
        return queueStoreOperation("loadDraftsOrdered", () =>
          store.loadDraftsOrdered(),
        );
      },

      async applySubmitResult(payload) {
        return queueWriteOperation("applySubmitResult", () =>
          store.applySubmitResult(payload),
        );
      },

      async applyCommittedBatch(payload) {
        return queueWriteOperation("applyCommittedBatch", () =>
          store.applyCommittedBatch(payload),
        );
      },

      async loadMaterializedView(payload) {
        return queueStoreOperation("loadMaterializedView", () =>
          store.loadMaterializedView(payload),
        );
      },

      async evictMaterializedView(payload) {
        return queueStoreOperation("evictMaterializedView", () =>
          store.evictMaterializedView(payload),
        );
      },

      async invalidateMaterializedView(payload) {
        return queueStoreOperation("invalidateMaterializedView", () =>
          store.invalidateMaterializedView(payload),
        );
      },

      async flushMaterializedViews() {
        return queueStoreOperation("flushMaterializedViews", async () => {
          const result = await store.flushMaterializedViews();
          if (walDirty) {
            await flushWalIfNeeded();
          }
          return result;
        });
      },

      async clearEvents() {
        await queueWriteOperation(async () => {
          await runExecute("DELETE FROM committed_events");
          await runExecute("DELETE FROM local_drafts");
        });
      },

      async loadMaterializedViewCheckpoint({ viewName, partition }) {
        return queueStoreOperation(
          "loadMaterializedViewCheckpoint",
          async () => {
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
          },
        );
      },

      async loadMaterializedViewCheckpoints({ viewName, partitions = [] }) {
        return queueStoreOperation(
          "loadMaterializedViewCheckpoints",
          async () => {
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
          },
        );
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
        await queueWriteOperation(
          "saveMaterializedViewCheckpoint",
          async () => {
            const checkpointMeta = {
              ...(meta && typeof meta === "object" && !Array.isArray(meta)
                ? structuredClone(meta)
                : {}),
              historyStats: await loadRepositoryHistoryStats(),
            };

            return runExecute(
              `INSERT OR REPLACE INTO ${MATERIALIZED_VIEW_TABLE}
           (view_name, partition, view_version, last_committed_id, value, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
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
          },
        );
      },

      async deleteMaterializedViewCheckpoint({ viewName, partition }) {
        await queueWriteOperation("deleteMaterializedViewCheckpoint", () =>
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

      async listDraftsOrdered() {
        return queueStoreOperation("listDraftsOrdered", () =>
          store.listDraftsOrdered(),
        );
      },

      async listCommitted() {
        return queueStoreOperation("listCommitted", () =>
          store.listCommitted(),
        );
      },

      async listCommittedAfter(payload = {}) {
        return queueStoreOperation("listCommittedAfter", () =>
          store.listCommittedAfter(payload),
        );
      },

      async getCursor() {
        return queueStoreOperation("getCursor", () => store.getCursor());
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
        storePromisesByDbPath.delete(dbPath);
        storeClosed = true;
        clearWalCheckpointRetryTimer();
        walCheckpointSubscription.unsubscribe();
        walCheckpointRequests.complete();
        await queueStoreOperation(async () => {
          await store.flushMaterializedViews();
          const truncateCheckpoint = await checkpointWal("TRUNCATE");
          if (!truncateCheckpoint.complete) {
            console.warn("SQLite WAL truncate checkpoint did not complete", {
              dbPath,
              projectId,
            });
          }
        });
        await db.close();
      },
    };
  })();

  storePromisesByDbPath.set(dbPath, storePromise);
  return storePromise;
};
