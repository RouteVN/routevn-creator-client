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
  applyRepositoryEventsToRepositoryState,
  createProjectCreateRepositoryEvent,
  initialProjectData,
} from "../shared/projectRepository.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
} from "../shared/projectRepositoryViews/shared.js";

export const PROJECT_DB_NAME = "project.db";

const MATERIALIZED_VIEW_TABLE = "materialized_view_state";
const APP_STATE_TABLE = "app_state";
const VERSIONS_KEY = "versions";
const PROJECT_CREATE_COMMAND_TYPE = "project.create";
const storePromisesByDbPath = new Map();
const SQL_BYTES_TYPE_KEY = "__routevn_sql_type";
const SQL_BYTES_TYPE_VALUE = "bytes";
const SQL_BYTES_DATA_KEY = "data";
const WAL_CHECKPOINT_THROTTLE_MS = 20000;
const ROUTEVN_CHECKPOINT_ENVELOPE_KEY = "__routevnCheckpoint";
const ROUTEVN_CHECKPOINT_ENVELOPE_VERSION = 1;
export const DRAFT_HISTORY_MODE_SNAPSHOT_ARCHIVE = "snapshot_archive";

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

const normalizeHistoryStatValue = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.max(0, Math.floor(numericValue));
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const areJsonStatesEqual = (left, right) => {
  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const normalizeRepositoryHistoryStats = (stats = {}) => ({
  committedCount: normalizeHistoryStatValue(stats?.committedCount),
  latestCommittedId: normalizeHistoryStatValue(stats?.latestCommittedId),
  draftCount: normalizeHistoryStatValue(stats?.draftCount),
  latestDraftClock: normalizeHistoryStatValue(stats?.latestDraftClock),
});

const areRepositoryHistoryStatsEqual = (left, right) => {
  const normalizedLeft = normalizeRepositoryHistoryStats(left);
  const normalizedRight = normalizeRepositoryHistoryStats(right);

  return (
    normalizedLeft.committedCount === normalizedRight.committedCount &&
    normalizedLeft.latestCommittedId === normalizedRight.latestCommittedId &&
    normalizedLeft.draftCount === normalizedRight.draftCount &&
    normalizedLeft.latestDraftClock === normalizedRight.latestDraftClock
  );
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

const emitEventLoadProgress = (onProgress, payload = {}) => {
  if (typeof onProgress !== "function") {
    return;
  }

  onProgress(structuredClone(payload));
};

const yieldForUiPaint = async () => {
  await new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
};

const applyRepositoryEventsToState = ({
  repositoryState,
  events = [],
  projectId,
} = {}) => {
  const applyResult = applyRepositoryEventsToRepositoryState({
    repositoryState,
    events,
    projectId,
  });

  if (applyResult?.valid === false || !applyResult?.repositoryState) {
    const error = new Error(
      applyResult?.error?.message || "Failed to apply repository events",
    );
    error.code = applyResult?.error?.code || "validation_failed";
    error.details = applyResult?.error?.details ?? {};
    throw error;
  }

  return applyResult.repositoryState;
};

export const loadRepositoryEvents = async ({
  store,
  projectId,
  onProgress,
  draftHistoryMode,
}) => {
  const committed = await store._debug.getCommitted();
  emitEventLoadProgress(onProgress, {
    phase: "read_project_events",
    label: "Reading project events...",
    current: 0,
    total: committed.length,
  });
  const drafts = await store._debug.getDrafts();
  const totalEventCount = committed.length + drafts.length;
  let processedEventCount = 0;
  let lastReportedCount = -1;
  const reportProgress = ({ force = false } = {}) => {
    if (!force && processedEventCount === lastReportedCount) {
      return false;
    }

    lastReportedCount = processedEventCount;
    emitEventLoadProgress(onProgress, {
      phase: "read_project_events",
      label:
        drafts.length > 0
          ? "Reading project events..."
          : "Loading committed events...",
      current: processedEventCount,
      total: totalEventCount,
    });
    return true;
  };

  const events = [];
  for (const committedEvent of committed) {
    const nextEvent = toRepositoryEvent(committedEvent, {
      created: committedEvent.serverTs,
      projectId,
    });
    assertRepositoryEventShape(nextEvent);
    events.push(nextEvent);
    processedEventCount += 1;
    if (
      processedEventCount === totalEventCount ||
      processedEventCount % 128 === 0
    ) {
      reportProgress();
      await yieldForUiPaint();
    }
  }

  if (drafts.length === 0) {
    reportProgress({ force: true });
    return events;
  }

  const draftEvents = drafts.map((draft) => {
    const nextEvent = toRepositoryEvent(draft, {
      created: draft.createdAt,
      projectId,
    });
    assertRepositoryEventShape(nextEvent);
    return nextEvent;
  });

  if (draftHistoryMode === DRAFT_HISTORY_MODE_SNAPSHOT_ARCHIVE) {
    const bootstrapEvent = draftEvents[0];
    events.push(bootstrapEvent);
    processedEventCount += 1;
    reportProgress({ force: true });
    await yieldForUiPaint();

    if (draftEvents.length === 1) {
      reportProgress({ force: true });
      return events;
    }

    let repositoryState = structuredClone(
      bootstrapEvent?.payload?.state ?? initialProjectData,
    );
    const invalidDrafts = [];
    let remainingDraftEvents = draftEvents.slice(1);

    while (remainingDraftEvents.length > 0) {
      try {
        repositoryState = applyRepositoryEventsToState({
          repositoryState,
          events: remainingDraftEvents,
          projectId,
        });
        events.push(...remainingDraftEvents);
        processedEventCount += remainingDraftEvents.length;
        reportProgress({ force: true });
        await yieldForUiPaint();
        break;
      } catch (error) {
        const failedDraftIndex = Number(error?.details?.commandIndex);
        const resolvedFailedDraftIndex =
          Number.isInteger(failedDraftIndex) &&
          failedDraftIndex >= 0 &&
          failedDraftIndex < remainingDraftEvents.length
            ? failedDraftIndex
            : 0;
        const acceptedPrefix = remainingDraftEvents.slice(
          0,
          resolvedFailedDraftIndex,
        );

        if (acceptedPrefix.length > 0) {
          repositoryState = applyRepositoryEventsToState({
            repositoryState,
            events: acceptedPrefix,
            projectId,
          });
          events.push(...acceptedPrefix);
          processedEventCount += acceptedPrefix.length;
          reportProgress({ force: true });
          await yieldForUiPaint();
        }

        const failedDraft = remainingDraftEvents[resolvedFailedDraftIndex];
        invalidDrafts.push({
          id: failedDraft?.id,
          code: error?.code || "validation_failed",
          message: error?.message || "Invalid local draft",
        });
        processedEventCount += 1;
        reportProgress({ force: true });
        await yieldForUiPaint();
        remainingDraftEvents = remainingDraftEvents.slice(
          resolvedFailedDraftIndex + 1,
        );
      }
    }

    for (const invalidDraft of invalidDrafts) {
      await store.applySubmitResult({
        result: {
          id: invalidDraft.id,
          status: "rejected",
          reason: invalidDraft.code,
          message: invalidDraft.message,
        },
      });
    }

    reportProgress({ force: true });
    return events;
  }

  emitEventLoadProgress(onProgress, {
    phase: "replay_local_drafts",
    label: "Reading project events...",
    current: processedEventCount,
    total: totalEventCount,
  });

  let repositoryState = applyRepositoryEventsToState({
    repositoryState: initialProjectData,
    events,
    projectId,
  });
  const invalidDrafts = [];
  let remainingDraftEvents = draftEvents;
  while (remainingDraftEvents.length > 0) {
    try {
      repositoryState = applyRepositoryEventsToState({
        repositoryState,
        events: remainingDraftEvents,
        projectId,
      });
      events.push(...remainingDraftEvents);
      processedEventCount += remainingDraftEvents.length;
      reportProgress({ force: true });
      await yieldForUiPaint();
      break;
    } catch (error) {
      const failedDraftIndex = Number(error?.details?.commandIndex);
      const resolvedFailedDraftIndex =
        Number.isInteger(failedDraftIndex) &&
        failedDraftIndex >= 0 &&
        failedDraftIndex < remainingDraftEvents.length
          ? failedDraftIndex
          : 0;
      const acceptedPrefix = remainingDraftEvents.slice(
        0,
        resolvedFailedDraftIndex,
      );

      if (acceptedPrefix.length > 0) {
        repositoryState = applyRepositoryEventsToState({
          repositoryState,
          events: acceptedPrefix,
          projectId,
        });
        events.push(...acceptedPrefix);
        processedEventCount += acceptedPrefix.length;
        reportProgress({ force: true });
        await yieldForUiPaint();
      }

      const failedDraft = remainingDraftEvents[resolvedFailedDraftIndex];
      invalidDrafts.push({
        id: failedDraft?.id,
        code: error?.code || "validation_failed",
        message: error?.message || "Invalid local draft",
      });
      processedEventCount += 1;
      reportProgress({ force: true });
      await yieldForUiPaint();
      console.warn("Discarding invalid local draft during project load", {
        projectId,
        draftId: failedDraft?.id,
        code: error?.code || "validation_failed",
        message: error?.message || "Invalid local draft",
      });
      remainingDraftEvents = remainingDraftEvents.slice(
        resolvedFailedDraftIndex + 1,
      );
    }
  }

  for (const invalidDraft of invalidDrafts) {
    await store.applySubmitResult({
      result: {
        id: invalidDraft.id,
        status: "rejected",
        reason: invalidDraft.code,
        message: invalidDraft.message,
      },
    });
  }

  reportProgress({ force: true });
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

const isBootstrapRepositoryEvent = (event) =>
  event?.type === PROJECT_CREATE_COMMAND_TYPE;

const isSceneLineHistoryEvent = (event) => {
  const partition = String(event?.partition ?? "");
  const type = String(event?.type ?? "");

  return (
    (partition.startsWith("s:") || partition.startsWith("m:s:")) &&
    type.startsWith("line.")
  );
};

const createCommittedEventRecord = (event, index, { projectId } = {}) => {
  const nextEvent = structuredClone(event);
  const defaultTimestamp = index + 1;

  nextEvent.committedId = index + 1;
  nextEvent.projectId = nextEvent.projectId || projectId;
  nextEvent.clientTs = Number.isFinite(Number(nextEvent?.clientTs))
    ? Number(nextEvent.clientTs)
    : defaultTimestamp;
  nextEvent.serverTs = Number.isFinite(Number(nextEvent?.serverTs))
    ? Number(nextEvent.serverTs)
    : nextEvent.clientTs;
  nextEvent.createdAt = Number.isFinite(Number(nextEvent?.createdAt))
    ? Number(nextEvent.createdAt)
    : nextEvent.serverTs;

  return nextEvent;
};

const createCommittedEventFromDraft = (draft, index, { projectId } = {}) => {
  return createCommittedEventRecord(
    {
      id: draft?.id,
      projectId,
      partition: draft?.partition,
      type: draft?.type,
      schemaVersion: draft?.schemaVersion,
      payload: structuredClone(draft?.payload),
      payloadCompression: draft?.payloadCompression,
      clientTs: Number.isFinite(Number(draft?.clientTs))
        ? Number(draft.clientTs)
        : undefined,
      serverTs: Number.isFinite(Number(draft?.createdAt))
        ? Number(draft.createdAt)
        : undefined,
      createdAt: Number.isFinite(Number(draft?.createdAt))
        ? Number(draft.createdAt)
        : undefined,
    },
    index,
    { projectId },
  );
};

const bumpVersionsActionIndex = (versions = [], delta = 0) => {
  if (!Array.isArray(versions) || delta === 0) {
    return structuredClone(Array.isArray(versions) ? versions : []);
  }

  return versions.map((version) => {
    const nextVersion = structuredClone(version);
    const actionIndex = Number(nextVersion?.actionIndex);
    if (!Number.isFinite(actionIndex)) {
      return nextVersion;
    }

    nextVersion.actionIndex = Math.max(0, Math.floor(actionIndex) + delta);
    return nextVersion;
  });
};

export const planBootstrapHistoryRepair = ({
  projectId,
  committedEvents = [],
  draftEvents = [],
  mainCheckpointState,
  versions = [],
} = {}) => {
  const committed = Array.isArray(committedEvents)
    ? committedEvents.map((event) => structuredClone(event))
    : [];
  const drafts = Array.isArray(draftEvents)
    ? draftEvents.map((event) => structuredClone(event))
    : [];
  const normalizedVersions = Array.isArray(versions)
    ? versions.map((version) => structuredClone(version))
    : [];

  if (committed.length === 0 && drafts.length === 0) {
    return {
      changed: false,
      reason: "history_empty",
    };
  }

  const committedBootstrapIndexes = committed
    .map((event, index) => (isBootstrapRepositoryEvent(event) ? index : -1))
    .filter((index) => index >= 0);
  const draftBootstrapIndexes = drafts
    .map((event, index) => (isBootstrapRepositoryEvent(event) ? index : -1))
    .filter((index) => index >= 0);

  const canonicalSnapshotDraftArchive =
    committed.length === 0 &&
    drafts.length > 1 &&
    draftBootstrapIndexes.length === 1 &&
    draftBootstrapIndexes[0] === 0 &&
    areJsonStatesEqual(drafts[0]?.payload?.state, mainCheckpointState);

  if (canonicalSnapshotDraftArchive) {
    return {
      changed: false,
      reason: "canonical_snapshot_draft_history",
    };
  }

  if (
    committedBootstrapIndexes.length === 1 &&
    committedBootstrapIndexes[0] === 0 &&
    draftBootstrapIndexes.length === 0
  ) {
    return {
      changed: false,
      reason: "history_valid",
    };
  }

  if (
    committedBootstrapIndexes.length > 1 ||
    draftBootstrapIndexes.length > 1 ||
    (committedBootstrapIndexes.length > 0 && draftBootstrapIndexes.length > 0)
  ) {
    return {
      changed: false,
      reason: "multiple_bootstrap_events",
    };
  }

  if (committedBootstrapIndexes.length === 1) {
    const bootstrapIndex = committedBootstrapIndexes[0];
    const [bootstrapEvent] = committed.splice(bootstrapIndex, 1);

    committed.unshift(bootstrapEvent);

    return {
      changed: true,
      reason: "reordered_bootstrap_committed_event",
      committedEvents: committed.map((event, index) =>
        createCommittedEventRecord(event, index, { projectId }),
      ),
      draftEvents: drafts,
      versions: normalizedVersions,
    };
  }

  if (draftBootstrapIndexes.length === 1) {
    const bootstrapIndex = draftBootstrapIndexes[0];
    const [bootstrapDraft] = drafts.splice(bootstrapIndex, 1);
    const repairedCommittedEvents = [
      createCommittedEventFromDraft(bootstrapDraft, 0, { projectId }),
      ...committed.map((event, index) =>
        createCommittedEventRecord(event, index + 1, { projectId }),
      ),
    ];

    return {
      changed: true,
      reason: "promoted_bootstrap_draft",
      committedEvents: repairedCommittedEvents,
      draftEvents: drafts,
      versions: normalizedVersions,
    };
  }

  const rawEvents = [...committed, ...drafts];
  const hasOnlySceneLineHistory =
    rawEvents.length > 0 && rawEvents.every(isSceneLineHistoryEvent);

  if (
    !mainCheckpointState ||
    typeof mainCheckpointState !== "object" ||
    Array.isArray(mainCheckpointState) ||
    !hasOnlySceneLineHistory
  ) {
    return {
      changed: false,
      reason: "missing_bootstrap_without_safe_recovery",
    };
  }

  const bootstrapEvent = createProjectCreateRepositoryEvent({
    projectId,
    state: structuredClone(mainCheckpointState),
    partition: MAIN_PARTITION,
  });
  const repairedCommittedEvents = [
    createCommittedEventRecord(
      {
        ...structuredClone(bootstrapEvent),
        projectId,
      },
      0,
      { projectId },
    ),
    ...committed.map((event, index) =>
      createCommittedEventRecord(event, index + 1, { projectId }),
    ),
  ];

  return {
    changed: true,
    reason: "synthesized_bootstrap_from_main_checkpoint",
    committedEvents: repairedCommittedEvents,
    draftEvents: drafts,
    versions: bumpVersionsActionIndex(normalizedVersions, 1),
  };
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

    const checkpointWal = async (mode = "PASSIVE") => {
      const checkpointMode = mode === "TRUNCATE" ? "TRUNCATE" : "PASSIVE";
      try {
        await runSelectNoRetry(`PRAGMA wal_checkpoint(${checkpointMode})`);
      } catch (error) {
        if (isSqliteLockError(error)) {
          return;
        }
        throw error;
      }
      walDirty = false;
    };

    const schedulePassiveWalCheckpoint = () => {
      if (storeClosed) {
        return;
      }
      walDirty = true;
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

    let projectHistoryIntegrityPromise;
    let draftHistoryMode;
    const loadAppValue = async (key) => {
      const rows = await runSelect(
        `SELECT value FROM ${APP_STATE_TABLE} WHERE key = $1`,
        [key],
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return parseStoredValue(row?.value);
    };
    const saveAppValue = async (key, value) => {
      await runExecute(
        `INSERT OR REPLACE INTO ${APP_STATE_TABLE} (key, value) VALUES ($1, $2)`,
        [key, JSON.stringify(value)],
      );
    };
    const loadMainCheckpointState = async () => {
      const rows = await runSelect(
        `SELECT view_version, last_committed_id, value, updated_at
         FROM ${MATERIALIZED_VIEW_TABLE}
         WHERE view_name = $1 AND partition = $2`,
        [MAIN_VIEW_NAME, MAIN_PARTITION],
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      const checkpoint = row
        ? toMaterializedViewCheckpoint({
            ...row,
            partition: MAIN_PARTITION,
          })
        : undefined;

      return checkpoint?.value;
    };
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
    const ensureProjectHistoryIntegrity = async () => {
      if (projectHistoryIntegrityPromise) {
        return projectHistoryIntegrityPromise;
      }

      projectHistoryIntegrityPromise = queueWriteOperation(
        "ensureProjectHistoryIntegrity",
        async () => {
          const committedEvents = await store._debug.getCommitted();
          const draftEvents = await store._debug.getDrafts();
          const versions = await loadAppValue(VERSIONS_KEY);
          const mainCheckpointState = await loadMainCheckpointState();
          const repairPlan = planBootstrapHistoryRepair({
            projectId,
            committedEvents,
            draftEvents,
            mainCheckpointState,
            versions,
          });

          if (!repairPlan.changed) {
            if (
              repairPlan.reason === "missing_bootstrap_without_safe_recovery"
            ) {
              console.warn("Project history is missing a bootstrap event", {
                projectId,
                committedEventCount: committedEvents.length,
                draftEventCount: draftEvents.length,
              });
            }

            if (repairPlan.reason === "canonical_snapshot_draft_history") {
              draftHistoryMode = DRAFT_HISTORY_MODE_SNAPSHOT_ARCHIVE;
            }

            return repairPlan;
          }

          const currentCursor = Number(await store._debug.getCursor()) || 0;

          await runExecute("DELETE FROM committed_events");
          await runExecute("DELETE FROM local_drafts");
          await runExecute(`DELETE FROM ${MATERIALIZED_VIEW_TABLE}`);

          if ((repairPlan.committedEvents || []).length > 0) {
            await store.applyCommittedBatch({
              events: repairPlan.committedEvents,
              nextCursor: Math.max(
                currentCursor,
                repairPlan.committedEvents.length,
              ),
            });
          }

          if ((repairPlan.draftEvents || []).length > 0) {
            await store.insertDrafts(repairPlan.draftEvents);
          }

          if (Object.hasOwn(repairPlan, "versions")) {
            await saveAppValue(VERSIONS_KEY, repairPlan.versions);
          }

          console.warn("Repaired project bootstrap history", {
            projectId,
            reason: repairPlan.reason,
            committedEventCountBefore: committedEvents.length,
            committedEventCountAfter: repairPlan.committedEvents.length,
            draftEventCountBefore: draftEvents.length,
            draftEventCountAfter: repairPlan.draftEvents.length,
          });

          return repairPlan;
        },
      ).catch((error) => {
        projectHistoryIntegrityPromise = undefined;
        throw error;
      });

      return projectHistoryIntegrityPromise;
    };

    await ensureProjectHistoryIntegrity();

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
            await checkpointWal("PASSIVE");
          }
          return result;
        });
      },

      async getEvents(payload = {}) {
        const events = await queueStoreOperation("getEvents", () =>
          loadRepositoryEvents({
            store,
            projectId,
            onProgress:
              typeof payload?.onProgress === "function"
                ? payload.onProgress
                : undefined,
            draftHistoryMode,
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

      _debug: {
        getDrafts: async () =>
          queueStoreOperation(() => store._debug.getDrafts()),
        getCommitted: async () =>
          queueStoreOperation(() => store._debug.getCommitted()),
        getCursor: async () =>
          queueStoreOperation(() => store._debug.getCursor()),
      },

      async getRepositoryHistoryStats() {
        return queueStoreOperation(() => loadRepositoryHistoryStats());
      },

      isRepositoryHistoryStatsEqual(left, right) {
        return areRepositoryHistoryStatsEqual(left, right);
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
