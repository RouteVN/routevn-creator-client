import {
  applyRepositoryEventsToRepositoryState,
  initialProjectData,
} from "../projectRepository.js";

export const DRAFT_HISTORY_MODE_SNAPSHOT_ARCHIVE = "snapshot_archive";

const normalizeHistoryStatValue = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.max(0, Math.floor(numericValue));
};

export const normalizeRepositoryHistoryStats = (stats = {}) => ({
  committedCount: normalizeHistoryStatValue(stats?.committedCount),
  latestCommittedId: normalizeHistoryStatValue(stats?.latestCommittedId),
  draftCount: normalizeHistoryStatValue(stats?.draftCount),
  latestDraftClock: normalizeHistoryStatValue(stats?.latestDraftClock),
});

export const getRepositoryHistoryLength = (stats = {}) => {
  const normalizedStats = normalizeRepositoryHistoryStats(stats);
  return normalizedStats.committedCount + normalizedStats.draftCount;
};

export const areRepositoryHistoryStatsEqual = (left, right) => {
  const normalizedLeft = normalizeRepositoryHistoryStats(left);
  const normalizedRight = normalizeRepositoryHistoryStats(right);

  return (
    normalizedLeft.committedCount === normalizedRight.committedCount &&
    normalizedLeft.latestCommittedId === normalizedRight.latestCommittedId &&
    normalizedLeft.draftCount === normalizedRight.draftCount &&
    normalizedLeft.latestDraftClock === normalizedRight.latestDraftClock
  );
};

export const toRepositoryEvent = (item, { created, projectId } = {}) => {
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

export const assertRepositoryEventShape = (event) => {
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

const emitRepositoryEventLoadProgress = (onProgress, payload = {}) => {
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

export const loadCommittedEventsFromClientStore = async (store) => {
  const committedEvents = [];
  let sinceCommittedId = 0;

  while (true) {
    const batch = await store.listCommittedAfter({
      sinceCommittedId,
      limit: 500,
    });
    const normalizedBatch = Array.isArray(batch) ? batch : [];
    if (normalizedBatch.length === 0) {
      break;
    }

    committedEvents.push(...normalizedBatch);

    const lastCommittedId = Number(normalizedBatch.at(-1)?.committedId);
    sinceCommittedId = Number.isFinite(lastCommittedId)
      ? lastCommittedId
      : sinceCommittedId + normalizedBatch.length;

    if (normalizedBatch.length < 500) {
      break;
    }
  }

  return committedEvents;
};

export const loadDraftEventsFromClientStore = async (store) => {
  const drafts = await store.listDraftsOrdered();
  return Array.isArray(drafts) ? drafts : [];
};

export const loadClientStoreCursor = async (store) => {
  return Number(await store.getCursor()) || 0;
};

export const loadRepositoryEventsFromClientStore = async ({
  store,
  projectId,
  onProgress,
  draftHistoryMode,
}) => {
  const committed = await loadCommittedEventsFromClientStore(store);
  emitRepositoryEventLoadProgress(onProgress, {
    phase: "read_project_events",
    label: "Reading project events...",
    current: 0,
    total: committed.length,
  });
  const drafts = await loadDraftEventsFromClientStore(store);
  const totalEventCount = committed.length + drafts.length;
  let processedEventCount = 0;
  let lastReportedCount = -1;
  const reportProgress = ({ force = false } = {}) => {
    if (!force && processedEventCount === lastReportedCount) {
      return false;
    }

    lastReportedCount = processedEventCount;
    emitRepositoryEventLoadProgress(onProgress, {
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
      await store.applySubmitResult?.({
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

  emitRepositoryEventLoadProgress(onProgress, {
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
    await store.applySubmitResult?.({
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

export const toBootstrappedDraftEvent = (repositoryEvent, index) => ({
  ...structuredClone(repositoryEvent),
  clientTs: Number.isFinite(Number(repositoryEvent?.clientTs))
    ? Number(repositoryEvent.clientTs)
    : Number.isFinite(Number(repositoryEvent?.meta?.clientTs))
      ? Number(repositoryEvent.meta.clientTs)
      : index + 1,
  createdAt: Number.isFinite(Number(repositoryEvent?.createdAt))
    ? Number(repositoryEvent.createdAt)
    : Number.isFinite(Number(repositoryEvent?.clientTs))
      ? Number(repositoryEvent.clientTs)
      : Number.isFinite(Number(repositoryEvent?.meta?.clientTs))
        ? Number(repositoryEvent.meta.clientTs)
        : index + 1,
});
