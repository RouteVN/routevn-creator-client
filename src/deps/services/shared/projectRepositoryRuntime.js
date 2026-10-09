import { createMaterializedViewRuntime } from "insieme/client";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "./collab/partitions.js";
import { createMainStateViewDefinition } from "./projectRepositoryViews/mainStateView.js";
import { createSceneBundleRuntime } from "./projectRepositoryViews/sceneBundleRuntime.js";
import {
  applySceneEventsToLoadedProjection,
  composeRepositoryState,
  composeRepositoryStateWithScenes,
  deleteSceneProjectionCheckpoint,
  findLineLocationInState,
  findSectionLocationInState,
  loadSceneProjectionState,
  saveSceneProjectionCheckpoint,
} from "./projectRepositoryViews/sceneStateView.js";
import {
  MAIN_PARTITION,
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
  cloneState,
  createMainProjectionState,
  createSceneProjectionState,
  getLatestSceneProjectionRevision,
  iterateCommittedEventBatches,
  isMainPartition,
  isMainScenePartition,
  isNonEmptyString,
  resolveSceneIdForPartition,
  toCommittedProjectEvent,
} from "./projectRepositoryViews/shared.js";

const summarizeReplayEvent = (event, index) => ({
  arrayIndex: index,
  eventOffset: index + 1,
  id: event?.id,
  type: event?.type,
  partition: event?.partition,
  projectId: event?.projectId,
  clientTs: Number.isFinite(Number(event?.clientTs))
    ? Number(event.clientTs)
    : Number.isFinite(Number(event?.meta?.clientTs))
      ? Number(event.meta.clientTs)
      : undefined,
  payload: structuredClone(event?.payload),
});

const createReplayError = ({
  error,
  events,
  targetEventCount,
  failedEventArrayIndex,
  baseIndex = 0,
  fallbackFailedBatchIndex,
}) => {
  const hasFailedIndex =
    Number.isInteger(failedEventArrayIndex) &&
    failedEventArrayIndex >= 0 &&
    failedEventArrayIndex < targetEventCount;
  const resolvedFailedIndex = hasFailedIndex
    ? failedEventArrayIndex
    : undefined;
  const failedBatchIndex =
    resolvedFailedIndex === undefined
      ? Number.isInteger(fallbackFailedBatchIndex) &&
        fallbackFailedBatchIndex >= 0 &&
        fallbackFailedBatchIndex < events.length
        ? fallbackFailedBatchIndex
        : undefined
      : resolvedFailedIndex - baseIndex;
  const startBatchIndex =
    failedBatchIndex === undefined ? 0 : Math.max(0, failedBatchIndex - 2);
  const endBatchIndex =
    failedBatchIndex === undefined
      ? Math.min(events.length, 3)
      : Math.min(events.length, failedBatchIndex + 3);
  const replayDiagnostics = {
    targetEventCount,
    failedEventArrayIndex: resolvedFailedIndex,
    failedEventOffset:
      resolvedFailedIndex === undefined ? undefined : resolvedFailedIndex + 1,
    failedEvent:
      resolvedFailedIndex === undefined || failedBatchIndex === undefined
        ? undefined
        : summarizeReplayEvent(events[failedBatchIndex], resolvedFailedIndex),
    nearbyEvents: events
      .slice(startBatchIndex, endBatchIndex)
      .map((event, eventIndexOffset) =>
        summarizeReplayEvent(
          event,
          baseIndex + startBatchIndex + eventIndexOffset,
        ),
      ),
  };
  const replayError = new Error(
    error?.message || "Failed to replay repository history",
  );

  replayError.name = "ProjectRepositoryReplayError";
  replayError.code = error?.code || "history_replay_failed";
  replayError.cause = error;
  replayError.details = {
    ...(error?.details && typeof error.details === "object"
      ? structuredClone(error.details)
      : {}),
    replay: replayDiagnostics,
  };
  return replayError;
};

const isPlainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const RESOURCE_CREATE_REPLAY_DEFINITIONS = Object.freeze({
  "image.create": {
    idField: "imageId",
    collectionKey: "images",
  },
  "spritesheet.create": {
    idField: "spritesheetId",
    collectionKey: "spritesheets",
  },
  "sound.create": {
    idField: "soundId",
    collectionKey: "sounds",
  },
  "voice.create": {
    idField: "voiceId",
    collectionKey: "voices",
  },
  "video.create": {
    idField: "videoId",
    collectionKey: "videos",
  },
  "animation.create": {
    idField: "animationId",
    collectionKey: "animations",
  },
  "audioEffect.create": {
    idField: "audioEffectId",
    collectionKey: "audioEffects",
  },
  "particle.create": {
    idField: "particleId",
    collectionKey: "particles",
  },
  "character.create": {
    idField: "characterId",
    collectionKey: "characters",
  },
  "font.create": {
    idField: "fontId",
    collectionKey: "fonts",
  },
  "transform.create": {
    idField: "transformId",
    collectionKey: "transforms",
  },
  "color.create": {
    idField: "colorId",
    collectionKey: "colors",
  },
  "textStyle.create": {
    idField: "textStyleId",
    collectionKey: "textStyles",
  },
  "variable.create": {
    idField: "variableId",
    collectionKey: "variables",
  },
  "layout.create": {
    idField: "layoutId",
    collectionKey: "layouts",
  },
  "control.create": {
    idField: "controlId",
    collectionKey: "controls",
  },
});

const isReplayValueSubset = (existingValue, expectedValue) => {
  if (Array.isArray(expectedValue)) {
    return (
      Array.isArray(existingValue) &&
      existingValue.length === expectedValue.length &&
      expectedValue.every((item, index) =>
        isReplayValueSubset(existingValue[index], item),
      )
    );
  }

  if (isPlainObject(expectedValue)) {
    if (!isPlainObject(existingValue)) {
      return false;
    }

    return Object.entries(expectedValue).every(([key, value]) =>
      isReplayValueSubset(existingValue[key], value),
    );
  }

  return existingValue === expectedValue;
};

const collectionTreeContainsItemId = (nodes = [], itemId) => {
  return (Array.isArray(nodes) ? nodes : []).some((node) => {
    if (node?.id === itemId) {
      return true;
    }

    return collectionTreeContainsItemId(node?.children, itemId);
  });
};

const hasReplayStringConflict = (leftValue, rightValue) => {
  if (!isNonEmptyString(leftValue) || !isNonEmptyString(rightValue)) {
    return false;
  }

  return leftValue !== rightValue;
};

const hasReplayNumberConflict = (leftValue, rightValue) => {
  const leftNumber = Number(leftValue);
  const rightNumber = Number(rightValue);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return false;
  }

  return leftNumber !== rightNumber;
};

const isReplayFileCreateDataCompatible = (existingFile, fileData) => {
  if (existingFile?.type === "folder" || fileData?.type === "folder") {
    return (
      existingFile?.type === "folder" &&
      fileData?.type === "folder" &&
      !hasReplayStringConflict(existingFile.name, fileData.name)
    );
  }

  return (
    !hasReplayStringConflict(existingFile.mimeType, fileData.mimeType) &&
    !hasReplayNumberConflict(existingFile.size, fileData.size) &&
    !hasReplayStringConflict(existingFile.sha256, fileData.sha256)
  );
};

const getReplayFailedCommandIndex = (error) => {
  const failedIndex = Number(error?.details?.commandIndex);
  return Number.isInteger(failedIndex) && failedIndex >= 0
    ? failedIndex
    : undefined;
};

const isDuplicateFileCreateReplayFailure = ({ event, error } = {}) => {
  return (
    event?.type === "file.create" &&
    String(error?.message || "").includes(
      "payload.fileId must not already exist",
    )
  );
};

const canSkipDuplicateFileCreateDuringReplay = ({
  repositoryState,
  event,
  error,
} = {}) => {
  if (!isDuplicateFileCreateReplayFailure({ event, error })) {
    return false;
  }

  const fileId =
    typeof event?.payload?.fileId === "string" ? event.payload.fileId : "";
  if (!fileId) {
    return false;
  }

  const existingFile = repositoryState?.files?.items?.[fileId];
  const fileData = event?.payload?.data;
  if (!isPlainObject(existingFile) || !isPlainObject(fileData)) {
    return false;
  }

  return (
    existingFile.id === fileId &&
    collectionTreeContainsItemId(repositoryState?.files?.tree, fileId) &&
    isReplayFileCreateDataCompatible(existingFile, fileData)
  );
};

const isDuplicateResourceCreateReplayFailure = ({ event, error } = {}) => {
  const replayDefinition = RESOURCE_CREATE_REPLAY_DEFINITIONS[event?.type];
  if (!replayDefinition) {
    return false;
  }

  return String(error?.message || "").includes(
    `payload.${replayDefinition.idField} must not already exist`,
  );
};

const canSkipDuplicateResourceCreateDuringReplay = ({
  repositoryState,
  event,
  error,
} = {}) => {
  const replayDefinition = RESOURCE_CREATE_REPLAY_DEFINITIONS[event?.type];
  if (
    !replayDefinition ||
    !isDuplicateResourceCreateReplayFailure({ event, error })
  ) {
    return false;
  }

  const { idField, collectionKey } = replayDefinition;
  const resourceId =
    typeof event?.payload?.[idField] === "string" ? event.payload[idField] : "";
  if (!resourceId) {
    return false;
  }

  const existingItem = repositoryState?.[collectionKey]?.items?.[resourceId];
  const resourceData = event?.payload?.data;
  if (!isPlainObject(existingItem) || !isPlainObject(resourceData)) {
    return false;
  }

  return (
    existingItem.id === resourceId &&
    collectionTreeContainsItemId(
      repositoryState?.[collectionKey]?.tree,
      resourceId,
    ) &&
    isReplayValueSubset(existingItem, resourceData)
  );
};

const canAttemptSequentialReplayRecovery = ({ events, error } = {}) => {
  const replayEvents = Array.isArray(events) ? events : [];
  const failedIndex = getReplayFailedCommandIndex(error);
  if (Number.isInteger(failedIndex) && failedIndex < replayEvents.length) {
    const failedEvent = replayEvents[failedIndex];

    return (
      isDuplicateFileCreateReplayFailure({
        event: failedEvent,
        error,
      }) ||
      isDuplicateResourceCreateReplayFailure({
        event: failedEvent,
        error,
      })
    );
  }

  return replayEvents.some(
    (event) =>
      isDuplicateFileCreateReplayFailure({
        event,
        error,
      }) ||
      isDuplicateResourceCreateReplayFailure({
        event,
        error,
      }),
  );
};

const replayEventsSequentially = ({
  repositoryState,
  events,
  reduceEventToState,
} = {}) => {
  let state = repositoryState;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];

    try {
      const nextState = reduceEventToState({
        repositoryState: state,
        event,
      });
      if (nextState !== undefined) {
        state = nextState;
      }
    } catch (error) {
      if (
        canSkipDuplicateFileCreateDuringReplay({
          repositoryState: state,
          event,
          error,
        })
      ) {
        continue;
      }

      if (
        canSkipDuplicateResourceCreateDuringReplay({
          repositoryState: state,
          event,
          error,
        })
      ) {
        continue;
      }

      return {
        valid: false,
        error,
        failedEventArrayIndex: index,
      };
    }
  }

  return {
    valid: true,
    repositoryState: state,
  };
};

export const replayEventsToRepositoryState = ({
  events,
  untilEventIndex,
  createInitialState,
  reduceEventToState,
  reduceEventsToState,
}) => {
  const parsedIndex = Number(untilEventIndex);
  const targetIndex = Number.isFinite(parsedIndex)
    ? Math.max(0, Math.min(Math.floor(parsedIndex), events.length))
    : events.length;

  if (typeof reduceEventsToState === "function") {
    try {
      return reduceEventsToState({
        repositoryState: createInitialState(),
        events: events.slice(0, targetIndex),
      });
    } catch (error) {
      const replayEvents = events.slice(0, targetIndex);
      if (
        typeof reduceEventToState === "function" &&
        canAttemptSequentialReplayRecovery({
          events: replayEvents,
          error,
        })
      ) {
        const sequentialReplay = replayEventsSequentially({
          repositoryState: createInitialState(),
          events: replayEvents,
          reduceEventToState,
        });

        if (sequentialReplay.valid) {
          return sequentialReplay.repositoryState;
        }

        throw createReplayError({
          error: sequentialReplay.error,
          events: replayEvents,
          targetEventCount: targetIndex,
          failedEventArrayIndex: sequentialReplay.failedEventArrayIndex,
          fallbackFailedBatchIndex: sequentialReplay.failedEventArrayIndex,
        });
      }

      const failedIndex = getReplayFailedCommandIndex(error);
      throw createReplayError({
        error,
        events: replayEvents,
        targetEventCount: targetIndex,
        failedEventArrayIndex: Number.isInteger(failedIndex)
          ? failedIndex
          : undefined,
        fallbackFailedBatchIndex: Number.isInteger(failedIndex)
          ? failedIndex
          : undefined,
      });
    }
  }

  let state = createInitialState();
  for (let index = 0; index < targetIndex; index += 1) {
    const replayResult = replayEventsSequentially({
      repositoryState: state,
      events: [events[index]],
      reduceEventToState,
    });

    if (!replayResult.valid) {
      throw createReplayError({
        error: replayResult.error,
        events: events.slice(0, targetIndex),
        targetEventCount: targetIndex,
        failedEventArrayIndex: index + replayResult.failedEventArrayIndex,
        fallbackFailedBatchIndex: index + replayResult.failedEventArrayIndex,
      });
    }

    state = replayResult.repositoryState;
  }

  return state;
};

export const projectRepositoryMainPartition = () => MAIN_PARTITION;

export const projectRepositoryScenePartitionFor = (sceneId) =>
  scenePartitionFor(sceneId);

export const projectRepositoryMainScenePartitionFor = (sceneId) =>
  mainScenePartitionFor(sceneId);

export const createProjectRepositoryRuntime = async ({
  projectId,
  store,
  events: sourceEvents,
  historyLoaded = Array.isArray(sourceEvents),
  initialRevision,
  historyStats,
  loadEvents = async () => [],
  createInitialState,
  reduceEventToState,
  reduceEventsToState,
  normalizeState = (state) => state,
  assertState = () => {},
  onHydrationProgress = () => {},
}) => {
  let events = Array.isArray(sourceEvents)
    ? sourceEvents.map((event) => structuredClone(event))
    : [];
  let hasLoadedEvents = historyLoaded;
  let historyLoadPromise;
  // The drafts the history load left out, set when loadEvents() resolves.
  let historySkippedDrafts;
  // The same drafts, reported once state built before the history loaded has
  // been rebuilt without them.
  let reportedSkippedDrafts;
  let skippedDraftRebuild;
  const skippedDraftListeners = new Set();
  // The revision of each event the main state was rebuilt from, by event id.
  let rebuiltEventRevisions = new Map();
  const listeners = new Set();
  let activeSceneId = null;
  let activeSceneState = null;
  let hasExplicitActiveScene = false;
  let currentRevision = Number.isFinite(Number(initialRevision))
    ? Math.max(0, Math.floor(Number(initialRevision)))
    : events.length;
  const createEventRevisions = (source = []) => {
    let previousRevision = 0;
    return source.map((event, index) => {
      const explicitRevision = Number(event?.repositoryRevision);
      const fallbackRevision = index + 1;
      const revision = Number.isFinite(explicitRevision)
        ? Math.max(
            previousRevision + 1,
            Math.floor(explicitRevision),
            fallbackRevision,
          )
        : Math.max(previousRevision + 1, fallbackRevision);
      previousRevision = revision;
      return revision;
    });
  };
  let eventRevisions = createEventRevisions(events);
  currentRevision = Math.max(
    currentRevision,
    eventRevisions.at(-1) ?? events.length,
  );
  let activeHydrationProgress;
  const hasDraftHistory = Number(historyStats?.draftCount || 0) > 0;

  const advanceCurrentRevision = () => {
    // Replayed history may omit preserved invalid drafts even though the
    // checkpoint revision still includes their positions.
    currentRevision = Math.max(currentRevision + 1, events.length);
    return currentRevision;
  };

  const resolveEventCountAtRevision = (untilRevision) => {
    const parsedRevision = Number(untilRevision);
    const targetRevision = Number.isFinite(parsedRevision)
      ? Math.max(0, Math.floor(parsedRevision))
      : currentRevision;
    let lowerIndex = 0;
    let upperIndex = eventRevisions.length;

    while (lowerIndex < upperIndex) {
      const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
      if (eventRevisions[middleIndex] <= targetRevision) {
        lowerIndex = middleIndex + 1;
      } else {
        upperIndex = middleIndex;
      }
    }

    return lowerIndex;
  };

  const listLoadedEventsAfterRevision = ({ sinceCommittedId, limit } = {}) => {
    const parsedRevision = Number(sinceCommittedId);
    const revision = Number.isFinite(parsedRevision)
      ? Math.max(0, Math.floor(parsedRevision))
      : 0;
    const startIndex = resolveEventCountAtRevision(revision);
    const safeLimit =
      Number.isInteger(limit) && limit > 0
        ? limit
        : Math.max(0, events.length - startIndex);

    return events
      .slice(startIndex, startIndex + safeLimit)
      .map((event, index) =>
        toCommittedProjectEvent({
          event,
          committedId: eventRevisions[startIndex + index],
          projectId,
        }),
      );
  };

  const toProgressValue = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.max(0, Math.floor(numericValue));
  };

  const emitHydrationProgress = ({ current, total }) => {
    onHydrationProgress({
      current: toProgressValue(current),
      total: toProgressValue(total),
    });
  };

  const ensureEventHistoryLoaded = async () => {
    if (hasLoadedEvents) {
      return events;
    }

    if (historyLoadPromise) {
      return historyLoadPromise;
    }

    const skippedDrafts = [];
    historyLoadPromise = Promise.resolve(
      loadEvents({
        onSkippedDraft: (skippedDraft) => {
          skippedDrafts.push(structuredClone(skippedDraft));
        },
      }),
    )
      .then((loadedEvents) => {
        events = Array.isArray(loadedEvents)
          ? loadedEvents.map((event) => structuredClone(event))
          : [];
        eventRevisions = createEventRevisions(events);
        hasLoadedEvents = true;
        historySkippedDrafts = skippedDrafts;
        currentRevision = Math.max(
          currentRevision,
          eventRevisions.at(-1) ?? events.length,
        );
        return events;
      })
      .catch((error) => {
        historyLoadPromise = undefined;
        throw error;
      });

    return historyLoadPromise;
  };

  const beginInitialMainHydrationProgress = async () => {
    const total = toProgressValue(events.length);
    const resolvedTotal = Math.max(total, toProgressValue(currentRevision));
    if (resolvedTotal <= 0) {
      return undefined;
    }

    const checkpoint = await store.loadMaterializedViewCheckpoint({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });
    const current =
      checkpoint?.viewVersion === MAIN_VIEW_VERSION
        ? Math.min(resolvedTotal, toProgressValue(checkpoint?.lastCommittedId))
        : 0;

    if (current >= resolvedTotal) {
      return undefined;
    }

    const progress = {
      total: resolvedTotal,
      current,
    };

    activeHydrationProgress = progress;
    emitHydrationProgress(progress);
    return progress;
  };

  const reportHydrationProgressFromBatch = (batch = []) => {
    if (!activeHydrationProgress) {
      return;
    }

    const latestCommittedId = Array.isArray(batch)
      ? batch.at(-1)?.committedId
      : 0;
    const nextCurrent = Math.min(
      activeHydrationProgress.total,
      Math.max(
        activeHydrationProgress.current,
        toProgressValue(latestCommittedId),
      ),
    );

    if (nextCurrent === activeHydrationProgress.current) {
      return;
    }

    activeHydrationProgress.current = nextCurrent;
    emitHydrationProgress(activeHydrationProgress);
  };

  const saveCurrentMainCheckpoint = async () => {
    const value = createMainProjectionState(currentMainState);
    await store.saveMaterializedViewCheckpoint({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
      viewVersion: MAIN_VIEW_VERSION,
      lastCommittedId: currentRevision,
      value,
      updatedAt: Date.now(),
    });
  };

  const endInitialMainHydrationProgress = ({
    progress,
    completed = false,
  } = {}) => {
    if (!progress || activeHydrationProgress !== progress) {
      return;
    }

    if (completed && progress.current < progress.total) {
      progress.current = progress.total;
      emitHydrationProgress(progress);
    }

    activeHydrationProgress = undefined;
  };

  const loadCurrentMainState = async () => {
    const loadedState = cloneState(
      await materializedViewRuntime.loadMaterializedView({
        viewName: MAIN_VIEW_NAME,
        partition: MAIN_PARTITION,
      }),
      createMainProjectionState(createInitialState()),
    );

    return createMainProjectionState(normalizeState(loadedState));
  };

  const materializedViewRuntime = createMaterializedViewRuntime({
    materializedViews: [
      createMainStateViewDefinition({
        createInitialState,
        reduceEventToState,
      }),
    ],
    getLatestCommittedId: async () =>
      hasLoadedEvents ? (eventRevisions.at(-1) ?? 0) : currentRevision,
    listCommittedAfter: async ({ sinceCommittedId, limit }) => {
      if (!hasLoadedEvents && !hasDraftHistory) {
        const committedBatch = await store.listCommittedAfter({
          sinceCommittedId,
          limit,
        });
        const normalizedCommittedBatch = Array.isArray(committedBatch)
          ? committedBatch.map((event) => structuredClone(event))
          : [];

        reportHydrationProgressFromBatch(normalizedCommittedBatch);
        return normalizedCommittedBatch;
      }

      await ensureEventHistoryLoaded();
      const batch = listLoadedEventsAfterRevision({
        sinceCommittedId,
        limit,
      });

      reportHydrationProgressFromBatch(batch);
      return batch;
    },
    loadCheckpoint: async ({ viewName, partition }) =>
      store.loadMaterializedViewCheckpoint({
        viewName,
        partition,
      }),
    saveCheckpoint: async (checkpoint) =>
      store.saveMaterializedViewCheckpoint(checkpoint),
    deleteCheckpoint: async ({ viewName, partition }) =>
      store.deleteMaterializedViewCheckpoint({
        viewName,
        partition,
      }),
  });

  const initialMainHydrationProgress =
    await beginInitialMainHydrationProgress();
  let currentMainState;

  try {
    currentMainState = await loadCurrentMainState();
  } finally {
    endInitialMainHydrationProgress({
      progress: initialMainHydrationProgress,
      completed: currentMainState !== undefined,
    });
  }

  assertState(currentMainState);

  const refreshMainState = async () => {
    currentMainState = await loadCurrentMainState();
    assertState(currentMainState);
  };

  const listCommittedAfterFromStore = async ({ sinceCommittedId, limit }) => {
    const committedBatch = await store.listCommittedAfter({
      sinceCommittedId,
      limit,
    });

    return Array.isArray(committedBatch)
      ? committedBatch.map((event) => structuredClone(event))
      : [];
  };

  const committedHistoryCount = Math.max(
    0,
    Math.floor(
      Number(historyStats?.committedCount) ||
        (hasDraftHistory ? 0 : currentRevision),
    ),
  );
  const latestPersistedCommittedId = Math.max(
    0,
    Math.floor(Number(historyStats?.latestCommittedId) || 0),
  );
  let committedTailCache;

  const loadCommittedSuffixFromStore = async (startIndex) => {
    const remainingCount = Math.max(0, committedHistoryCount - startIndex);
    if (remainingCount === 0) {
      return [];
    }

    const loadFromBeginning = async () => {
      const committedEvents = await listCommittedAfterFromStore({
        sinceCommittedId: 0,
        limit: committedHistoryCount,
      });
      return committedEvents.slice(startIndex, committedHistoryCount);
    };

    if (latestPersistedCommittedId <= 0) {
      return loadFromBeginning();
    }

    const isExactSuffix = (committedEvents) => {
      if (committedEvents.length !== remainingCount) {
        return false;
      }

      return (
        Number(committedEvents.at(-1)?.committedId) ===
        latestPersistedCommittedId
      );
    };

    const readAfterCursor = (persistedCursor) =>
      listCommittedAfterFromStore({
        sinceCommittedId: persistedCursor,
        limit: remainingCount,
      });

    let windowSize = Math.max(1, remainingCount);
    let upperCursor = latestPersistedCommittedId;

    while (true) {
      const candidateCursor = Math.max(
        0,
        latestPersistedCommittedId - windowSize,
      );
      const committedEvents = await readAfterCursor(candidateCursor);
      if (isExactSuffix(committedEvents)) {
        return committedEvents;
      }

      if (
        committedEvents.length === remainingCount &&
        Number(committedEvents.at(-1)?.committedId) < latestPersistedCommittedId
      ) {
        let lowerCursor = candidateCursor + 1;
        let higherCursor = upperCursor - 1;

        while (lowerCursor <= higherCursor) {
          const midpointCursor = Math.floor((lowerCursor + higherCursor) / 2);
          const midpointEvents = await readAfterCursor(midpointCursor);
          if (isExactSuffix(midpointEvents)) {
            return midpointEvents;
          }

          if (midpointEvents.length < remainingCount) {
            higherCursor = midpointCursor - 1;
          } else {
            lowerCursor = midpointCursor + 1;
          }
        }

        return loadFromBeginning();
      }

      if (candidateCursor === 0) {
        return loadFromBeginning();
      }

      upperCursor = candidateCursor;
      windowSize = Math.min(latestPersistedCommittedId, windowSize * 2);
    }
  };

  const loadCommittedTailFromRepositoryOffset = async (startIndex) => {
    if (committedTailCache && startIndex >= committedTailCache.startIndex) {
      return committedTailCache.events.slice(
        startIndex - committedTailCache.startIndex,
      );
    }

    const persistedEvents = await loadCommittedSuffixFromStore(startIndex);
    const normalizedEvents = persistedEvents.map((event, index) =>
      toCommittedProjectEvent({
        event,
        committedId: startIndex + index + 1,
        projectId,
      }),
    );
    committedTailCache = {
      startIndex,
      events: normalizedEvents,
    };
    return normalizedEvents;
  };

  let draftEventsPromise;
  const loadDraftEventsFromStore = async () => {
    if (draftEventsPromise) {
      return draftEventsPromise;
    }

    draftEventsPromise = Promise.resolve(store.listDraftsOrdered())
      .then((drafts) =>
        Array.isArray(drafts)
          ? drafts.map((draft) => structuredClone(draft))
          : [],
      )
      .catch((error) => {
        draftEventsPromise = undefined;
        throw error;
      });

    return draftEventsPromise;
  };

  const listCommittedAfterFromRepository = async ({
    sinceCommittedId,
    limit,
  } = {}) => {
    if (!hasLoadedEvents && !hasDraftHistory) {
      return listCommittedAfterFromStore({
        sinceCommittedId,
        limit,
      });
    }

    await ensureEventHistoryLoaded();
    return listLoadedEventsAfterRevision({ sinceCommittedId, limit });
  };

  const listSceneOverviewEventsAfterFromRepository = async ({
    sinceCommittedId,
    limit,
  } = {}) => {
    const startIndex = Math.max(
      0,
      Number.isFinite(Number(sinceCommittedId))
        ? Math.floor(Number(sinceCommittedId))
        : 0,
    );
    const safeLimit =
      Number.isInteger(limit) && limit > 0
        ? limit
        : Math.max(events.length, currentRevision);
    if (startIndex >= currentRevision) {
      return [];
    }

    if (!hasLoadedEvents) {
      const tailEvents = [];
      const remainingCommittedCount = Math.max(
        0,
        committedHistoryCount - startIndex,
      );
      const committedLimit = Math.min(safeLimit, remainingCommittedCount);

      if (committedLimit > 0) {
        const committedEvents =
          await loadCommittedTailFromRepositoryOffset(startIndex);
        tailEvents.push(...committedEvents.slice(0, committedLimit));
        if (committedEvents.length < committedLimit) {
          return tailEvents;
        }
      }

      if (hasDraftHistory && tailEvents.length < safeLimit) {
        const drafts = await loadDraftEventsFromStore();
        const draftStartIndex = Math.max(0, startIndex - committedHistoryCount);
        const remainingLimit = safeLimit - tailEvents.length;
        tailEvents.push(
          ...drafts
            .slice(draftStartIndex, draftStartIndex + remainingLimit)
            .map((draft, index) =>
              toCommittedProjectEvent({
                event: draft,
                committedId:
                  committedHistoryCount + draftStartIndex + index + 1,
                projectId,
              }),
            ),
        );
      }

      return tailEvents;
    }

    return listLoadedEventsAfterRevision({
      sinceCommittedId,
      limit: safeLimit,
    });
  };

  const loadState = async (untilEventIndex) => {
    if (hasLoadedEvents || hasDraftHistory) {
      const replayEvents = hasLoadedEvents
        ? events
        : await ensureEventHistoryReady();
      return replayEventsToRepositoryState({
        events: replayEvents,
        untilEventIndex: resolveEventCountAtRevision(untilEventIndex),
        createInitialState,
        reduceEventToState,
        reduceEventsToState,
      });
    }

    const parsedIndex = Number(untilEventIndex);
    const targetIndex = Number.isFinite(parsedIndex)
      ? Math.max(0, Math.min(Math.floor(parsedIndex), currentRevision))
      : currentRevision;

    let replayedEventCount = 0;
    let state = createInitialState();

    for await (const committedBatch of iterateCommittedEventBatches({
      listCommittedAfter: listCommittedAfterFromStore,
    })) {
      const remainingEventCount = targetIndex - replayedEventCount;
      if (remainingEventCount <= 0) {
        break;
      }

      const replayBatch =
        committedBatch.length > remainingEventCount
          ? committedBatch.slice(0, remainingEventCount)
          : committedBatch;
      const batchStartIndex = replayedEventCount;

      try {
        const nextState = reduceEventsToState({
          repositoryState: state,
          events: replayBatch,
        });
        if (nextState !== undefined) {
          state = nextState;
        }
      } catch (error) {
        if (
          typeof reduceEventToState === "function" &&
          canAttemptSequentialReplayRecovery({
            events: replayBatch,
            error,
          })
        ) {
          const sequentialReplay = replayEventsSequentially({
            repositoryState: state,
            events: replayBatch,
            reduceEventToState,
          });

          if (sequentialReplay.valid) {
            state = sequentialReplay.repositoryState;
            replayedEventCount += replayBatch.length;
            continue;
          }

          throw createReplayError({
            error: sequentialReplay.error,
            events: replayBatch,
            targetEventCount: targetIndex,
            failedEventArrayIndex:
              batchStartIndex + sequentialReplay.failedEventArrayIndex,
            baseIndex: batchStartIndex,
            fallbackFailedBatchIndex: sequentialReplay.failedEventArrayIndex,
          });
        }

        const failedBatchIndex = getReplayFailedCommandIndex(error);
        throw createReplayError({
          error,
          events: replayBatch,
          targetEventCount: targetIndex,
          failedEventArrayIndex: Number.isInteger(failedBatchIndex)
            ? batchStartIndex + failedBatchIndex
            : undefined,
          baseIndex: batchStartIndex,
          fallbackFailedBatchIndex: Number.isInteger(failedBatchIndex)
            ? failedBatchIndex
            : undefined,
        });
      }

      replayedEventCount += replayBatch.length;
    }

    return state;
  };

  // Without `eventsForProjection`, the projection pages through the history.
  const loadSceneProjectionFromEvents = (sceneId, eventsForProjection) =>
    loadSceneProjectionState({
      store,
      mainState: currentMainState,
      events: eventsForProjection,
      listCommittedAfter: listCommittedAfterFromRepository,
      createInitialState,
      reduceEventToState,
      reduceEventsToState,
      sceneId,
    });

  const loadSceneProjection = async (sceneId) => {
    if (!hasLoadedEvents && !hasDraftHistory) {
      return loadSceneProjectionFromEvents(sceneId);
    }

    return loadSceneProjectionFromEvents(
      sceneId,
      await ensureEventHistoryReady(),
    );
  };

  const sceneBundleRuntime = createSceneBundleRuntime({
    store,
    listCommittedAfter: listSceneOverviewEventsAfterFromRepository,
    getCurrentMainState: () => currentMainState,
    getCurrentRevision: () => currentRevision,
    getCurrentHistoryStats: () =>
      store.getRepositoryHistoryStats?.() ?? historyStats,
    getActiveSceneId: () => activeSceneId,
    getActiveSceneState: () => activeSceneState,
    loadSceneProjection,
  });

  const getCurrentComposedState = () =>
    composeRepositoryState({
      mainState: currentMainState,
      activeSceneId,
      activeSceneState,
    });

  const getFileRecord = (fileId) => {
    const fileRecord = currentMainState?.files?.items?.[fileId];
    return fileRecord && typeof fileRecord === "object"
      ? structuredClone(fileRecord)
      : undefined;
  };

  const notifyStateListeners = () => {
    const repositoryState = structuredClone(getCurrentComposedState());
    const revision = currentRevision;
    listeners.forEach((listener) => {
      listener({
        repositoryState,
        revision,
      });
    });
  };

  const setActiveSceneProjection = ({
    sceneId,
    sceneState,
    explicit = false,
  }) => {
    activeSceneId = isNonEmptyString(sceneId) ? sceneId : null;
    activeSceneState = activeSceneId ? sceneState || null : null;
    if (explicit) {
      hasExplicitActiveScene = activeSceneId !== null;
    }
  };

  const clearActiveSceneProjection = ({ explicit = false } = {}) => {
    activeSceneId = null;
    activeSceneState = null;
    if (explicit) {
      hasExplicitActiveScene = false;
    }
  };

  const ensureActiveSceneProjectionLoaded = async (
    sceneId,
    { explicit = false } = {},
  ) => {
    if (!isNonEmptyString(sceneId)) {
      clearActiveSceneProjection({ explicit });
      return;
    }

    setActiveSceneProjection({
      sceneId,
      sceneState: await loadSceneProjection(sceneId),
      explicit,
    });
  };

  const pruneRemovedActiveScene = async () => {
    if (!activeSceneId) {
      return;
    }

    const sceneExists = Boolean(
      currentMainState?.scenes?.items?.[activeSceneId],
    );
    if (sceneExists) {
      return;
    }

    const removedSceneId = activeSceneId;
    clearActiveSceneProjection();
    await deleteSceneProjectionCheckpoint({ store, sceneId: removedSceneId });
    await sceneBundleRuntime.clearSceneOverview(removedSceneId);
  };

  // Scene projection checkpoints count revisions by position in the loaded
  // history, and a left-out draft moves every later event, so every scene's
  // projection is rebuilt when it is next loaded. Overviews and text stats
  // count stable revisions: only the scenes of the left-out drafts are
  // cleared, or every scene when a draft was made in the main partition,
  // which can change any scene.
  const clearSceneCachesForSkippedDrafts = async (skippedDrafts) => {
    const draftSceneIds = new Set(
      skippedDrafts.map(({ sceneId }) => sceneId).filter(isNonEmptyString),
    );
    const sceneIds = new Set(draftSceneIds);
    for (const [sceneId, scene] of Object.entries(
      currentMainState?.scenes?.items ?? {},
    )) {
      if (scene?.type !== "folder") {
        sceneIds.add(sceneId);
      }
    }
    await Promise.all(
      [...sceneIds].map((sceneId) =>
        deleteSceneProjectionCheckpoint({ store, sceneId }),
      ),
    );

    if (skippedDrafts.some(({ partition }) => isMainPartition(partition))) {
      await sceneBundleRuntime.clearAllSceneOverviews();
    } else {
      for (const sceneId of draftSceneIds) {
        await sceneBundleRuntime.clearSceneOverview(sceneId);
      }
    }

    await pruneRemovedActiveScene();
    if (activeSceneId) {
      activeSceneState = await loadSceneProjectionFromEvents(
        activeSceneId,
        events,
      );
    }
  };

  const notifySkippedDraftListeners = () => {
    skippedDraftListeners.forEach((listener) => {
      listener(structuredClone(reportedSkippedDrafts));
    });
  };

  // The main view saves its checkpoint at the last event it applied, which
  // leaves out the positions of left-out drafts at the end of the history.
  // Saving the current main state over it keeps the revision that counts them.
  const persistMainCheckpoint = async () => {
    await materializedViewRuntime.flushMaterializedView({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });
    await saveCurrentMainCheckpoint();
  };

  // The main state only applies events of the main and main-scene partitions,
  // so a reused main checkpoint cannot include a left-out draft from a scene
  // partition.
  const rebuildMainStateFromLoadedHistory = async () => {
    await materializedViewRuntime.invalidateMaterializedView({
      viewName: MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });
    await refreshMainState();
    await persistMainCheckpoint();
    rebuiltEventRevisions = new Map(
      events.map((event, index) => [event.id, eventRevisions[index]]),
    );
  };

  // State built before the history loaded can still include drafts the load
  // left out: a reused main checkpoint, scene projection checkpoints and scene
  // overviews. Rebuild it from the loaded history, then report the drafts.
  // Callers wait for this, so it must not use ensureEventHistoryReady().
  const rebuildWithoutSkippedDrafts = async () => {
    const skippedDrafts = historySkippedDrafts;
    if (
      skippedDrafts.some(
        ({ partition }) =>
          isMainPartition(partition) || isMainScenePartition(partition),
      )
    ) {
      await rebuildMainStateFromLoadedHistory();
    }
    if (skippedDrafts.length > 0) {
      await clearSceneCachesForSkippedDrafts(skippedDrafts);
    }

    // Set before listeners run, so a listener that throws cannot start the
    // rebuild again.
    reportedSkippedDrafts = skippedDrafts;
    if (skippedDrafts.length > 0) {
      notifyStateListeners();
    }
    notifySkippedDraftListeners();
  };

  // Resolves at once while the history has not been loaded through
  // loadEvents(), so it never starts a history load, and once the rebuild
  // has finished.
  const reconcileSkippedDrafts = () => {
    if (
      historySkippedDrafts === undefined ||
      reportedSkippedDrafts !== undefined
    ) {
      return Promise.resolve();
    }

    skippedDraftRebuild ??= rebuildWithoutSkippedDrafts().finally(() => {
      skippedDraftRebuild = undefined;
    });
    return skippedDraftRebuild;
  };

  // Loads the history outside the main view's lock and waits until state
  // built before it no longer includes left-out drafts.
  const ensureEventHistoryReady = async () => {
    const loadedEvents = await ensureEventHistoryLoaded();
    await reconcileSkippedDrafts();
    return loadedEvents;
  };

  const isEventHistoryPending = () =>
    !hasLoadedEvents ||
    (historySkippedDrafts !== undefined && reportedSkippedDrafts === undefined);

  // Records an added event and applies it to the main state. Storage holds an
  // event before it is added here, so the history load can already have put
  // it in a rebuilt main state; it then keeps the revision it was loaded at.
  const commitAddedEvent = async (event) => {
    const rebuiltRevision = rebuiltEventRevisions.get(event.id);
    if (rebuiltRevision !== undefined) {
      return toCommittedProjectEvent({
        event,
        committedId: rebuiltRevision,
        projectId,
      });
    }

    events.push(structuredClone(event));
    const committedId = advanceCurrentRevision();
    eventRevisions.push(committedId);
    const committedEvent = toCommittedProjectEvent({
      event,
      committedId,
      projectId,
    });
    await materializedViewRuntime.onCommittedEvent(committedEvent);
    return committedEvent;
  };

  const updateActiveSceneProjection = async (committedEvents = []) => {
    if (!activeSceneId || !activeSceneState) {
      return;
    }

    const scopedEvents = [];
    for (const committedEvent of committedEvents) {
      const partition = committedEvent?.partition;
      if (
        !isNonEmptyString(partition) ||
        (!partition.startsWith("s:") && !partition.startsWith("m:s:"))
      ) {
        continue;
      }

      const sceneId = resolveSceneIdForPartition(currentMainState, partition);
      if (sceneId !== activeSceneId) {
        continue;
      }

      scopedEvents.push(committedEvent);
    }

    if (scopedEvents.length === 0) {
      return;
    }

    // Main-scene section lifecycle is already reflected in currentMainState
    // after refreshMainState(), so rebuild the active snapshot from that base
    // and replay only scene line events on top.
    activeSceneState = createSceneProjectionState(
      composeRepositoryState({
        mainState: currentMainState,
        activeSceneId,
        activeSceneState,
      }),
      scenePartitionFor(activeSceneId),
    );

    const lineScopedEvents = scopedEvents.filter((committedEvent) => {
      const type = committedEvent?.type;
      return typeof type === "string" && type.startsWith("line.");
    });

    if (lineScopedEvents.length > 0) {
      activeSceneState = applySceneEventsToLoadedProjection({
        mainState: currentMainState,
        sceneState: activeSceneState,
        sceneId: activeSceneId,
        sourceEvents: lineScopedEvents,
        reduceEventsToState,
      });
    }

    await saveSceneProjectionCheckpoint({
      store,
      sceneId: activeSceneId,
      value: activeSceneState,
      lastCommittedId: getLatestSceneProjectionRevision({
        events,
        sceneId: activeSceneId,
      }),
      updatedAt: Date.now(),
    });
  };

  const autoAdoptSceneProjection = async (committedEvents = []) => {
    if (hasExplicitActiveScene || activeSceneId) {
      return false;
    }

    for (const committedEvent of committedEvents) {
      const partition = committedEvent?.partition;
      if (
        !isNonEmptyString(partition) ||
        (!partition.startsWith("s:") && !partition.startsWith("m:s:"))
      ) {
        continue;
      }

      const sceneId = resolveSceneIdForPartition(currentMainState, partition);
      if (!sceneId) {
        continue;
      }

      await ensureActiveSceneProjectionLoaded(sceneId);
      return true;
    }

    return false;
  };

  const getContextState = async ({
    sceneIds = [],
    sectionIds = [],
    lineIds = [],
  } = {}) => {
    const nextSceneIds = new Set();

    for (const sceneId of sceneIds || []) {
      if (isNonEmptyString(sceneId)) {
        nextSceneIds.add(sceneId);
      }
    }

    const sceneStatesBySceneId = new Map();
    if (activeSceneId && activeSceneState) {
      sceneStatesBySceneId.set(activeSceneId, activeSceneState);
    }

    for (const sectionId of sectionIds || []) {
      const location = findSectionLocationInState(
        getCurrentComposedState(),
        sectionId,
      );
      if (location?.sceneId) {
        nextSceneIds.add(location.sceneId);
      }
    }

    for (const lineId of lineIds || []) {
      const loadedLocation = findLineLocationInState(
        composeRepositoryStateWithScenes({
          mainState: currentMainState,
          sceneStatesBySceneId,
        }),
        lineId,
      );
      if (loadedLocation?.sceneId) {
        nextSceneIds.add(loadedLocation.sceneId);
        continue;
      }

      const knownSceneIds = Object.keys(currentMainState?.scenes?.items || {});
      for (const sceneId of knownSceneIds) {
        const sceneProjection =
          sceneStatesBySceneId.get(sceneId) ||
          (await loadSceneProjection(sceneId));
        sceneStatesBySceneId.set(sceneId, sceneProjection);
        const sceneLocation = findLineLocationInState(sceneProjection, lineId);
        if (sceneLocation?.sceneId) {
          nextSceneIds.add(sceneId);
          break;
        }
      }
    }

    for (const sceneId of nextSceneIds) {
      if (sceneStatesBySceneId.has(sceneId)) {
        continue;
      }

      if (sceneId === activeSceneId && activeSceneState) {
        sceneStatesBySceneId.set(sceneId, activeSceneState);
        continue;
      }

      sceneStatesBySceneId.set(sceneId, await loadSceneProjection(sceneId));
    }

    return composeRepositoryStateWithScenes({
      mainState: currentMainState,
      sceneStatesBySceneId,
    });
  };

  // Building the main state may have loaded the history from inside the main
  // view's lock, where it cannot be rebuilt.
  await reconcileSkippedDrafts();

  return {
    getState(untilEventIndex) {
      if (untilEventIndex === undefined || untilEventIndex === null) {
        return structuredClone(getCurrentComposedState());
      }

      if (!hasLoadedEvents) {
        throw new Error(
          "Historical repository snapshots require loaded event history",
        );
      }

      // Historical snapshots are replayed into a fresh state tree, so returning
      // that replay result directly avoids one more full clone during export.
      return replayEventsToRepositoryState({
        events,
        untilEventIndex: resolveEventCountAtRevision(untilEventIndex),
        createInitialState,
        reduceEventToState,
        reduceEventsToState,
      });
    },

    getFileRecord,

    getRevision(untilEventIndex) {
      if (untilEventIndex === undefined || untilEventIndex === null) {
        return currentRevision;
      }

      const parsedIndex = Number(untilEventIndex);
      if (!Number.isFinite(parsedIndex)) {
        return currentRevision;
      }

      return Math.max(0, Math.min(Math.floor(parsedIndex), events.length));
    },

    async loadEvents() {
      return (await ensureEventHistoryReady()).map((event) =>
        structuredClone(event),
      );
    },

    async loadState(untilEventIndex) {
      return structuredClone(await loadState(untilEventIndex));
    },

    subscribe(listener, { emitCurrent = true } = {}) {
      if (typeof listener !== "function") {
        throw new Error("listener must be a function");
      }

      listeners.add(listener);
      if (emitCurrent) {
        listener({
          repositoryState: structuredClone(getCurrentComposedState()),
          revision: currentRevision,
        });
      }

      return () => {
        listeners.delete(listener);
      };
    },

    // Calls `listener` with the drafts the loaded history left out, after
    // state built before it has been rebuilt without them. The history loads
    // on demand, so this can come at any time after the repository opens.
    subscribeSkippedDrafts(listener, { emitCurrent = true } = {}) {
      skippedDraftListeners.add(listener);
      if (emitCurrent && reportedSkippedDrafts !== undefined) {
        listener(structuredClone(reportedSkippedDrafts));
      }

      return () => {
        skippedDraftListeners.delete(listener);
      };
    },

    async setActiveSceneId(sceneId) {
      const nextSceneId = isNonEmptyString(sceneId) ? sceneId : null;
      if (activeSceneId === nextSceneId && (!nextSceneId || activeSceneState)) {
        hasExplicitActiveScene = nextSceneId !== null;
        return;
      }

      if (nextSceneId) {
        await ensureActiveSceneProjectionLoaded(nextSceneId, {
          explicit: true,
        });
        await sceneBundleRuntime.ensureSceneBundle(nextSceneId);
      } else {
        clearActiveSceneProjection({ explicit: true });
      }

      notifyStateListeners();
    },

    async clearActiveSceneId() {
      clearActiveSceneProjection({ explicit: true });
      notifyStateListeners();
    },

    async getContextState(payload = {}) {
      await reconcileSkippedDrafts();
      return structuredClone(await getContextState(payload));
    },

    async getSceneOverview(sceneId) {
      await reconcileSkippedDrafts();
      return sceneBundleRuntime.ensureSceneBundle(sceneId);
    },

    async loadSceneOverviews({ sceneIds = [] } = {}) {
      await reconcileSkippedDrafts();
      return sceneBundleRuntime.loadSceneOverviews({ sceneIds });
    },

    async cacheSceneTextStats(payload = {}) {
      await reconcileSkippedDrafts();
      return sceneBundleRuntime.cacheSceneTextStats(payload);
    },

    async loadSceneTextStats(payload = {}) {
      await reconcileSkippedDrafts();
      return sceneBundleRuntime.loadSceneTextStats(payload);
    },

    async ensureSceneTextStats(payload = {}) {
      await reconcileSkippedDrafts();
      return sceneBundleRuntime.ensureSceneTextStats(payload);
    },

    async addEvent(event) {
      if (isEventHistoryPending()) {
        await ensureEventHistoryReady();
      }

      const committedEvent = await commitAddedEvent(event);
      await refreshMainState();
      const adoptedActiveScene = await autoAdoptSceneProjection([
        committedEvent,
      ]);
      if (!adoptedActiveScene) {
        await updateActiveSceneProjection([committedEvent]);
      }
      await pruneRemovedActiveScene();
      await sceneBundleRuntime.handleCommittedEvents([committedEvent]);
      notifyStateListeners();
    },

    async addEvents(sourceEvents = []) {
      const nextEvents = Array.isArray(sourceEvents)
        ? sourceEvents.filter(Boolean)
        : [];
      if (nextEvents.length === 0) {
        return;
      }

      if (isEventHistoryPending()) {
        await ensureEventHistoryReady();
      }

      const committedEvents = [];
      for (const event of nextEvents) {
        committedEvents.push(await commitAddedEvent(event));
      }

      await refreshMainState();
      const adoptedActiveScene =
        await autoAdoptSceneProjection(committedEvents);
      if (!adoptedActiveScene) {
        await updateActiveSceneProjection(committedEvents);
      }
      await pruneRemovedActiveScene();
      await sceneBundleRuntime.handleCommittedEvents(committedEvents);
      notifyStateListeners();
    },

    async flushMainCheckpoint() {
      await reconcileSkippedDrafts();
      await persistMainCheckpoint();
    },

    async flushMaterializedViews() {
      await reconcileSkippedDrafts();
      await materializedViewRuntime.flushMaterializedViews();
      await saveCurrentMainCheckpoint();
      await sceneBundleRuntime.flushSceneOverviews();
    },
  };
};
