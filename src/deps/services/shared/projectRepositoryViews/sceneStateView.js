import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../collab/partitions.js";
import { committedEventToCommand } from "../collab/mappers.js";
import {
  SCENE_VIEW_NAME,
  SCENE_VIEW_VERSION,
  cloneState,
  createEmptyLinesCollection,
  createSceneProjectionState,
  getCommittedEventRevision,
  getLatestSceneProjectionRevision,
  iterateCommittedEventBatches,
  isNonEmptyString,
} from "./shared.js";

const getScenePartition = (sceneId) => scenePartitionFor(sceneId);
const getMainScenePartition = (sceneId) => mainScenePartitionFor(sceneId);
const SCENE_PROJECTION_YIELD_INTERVAL = 128;

const yieldToBrowser = async () => {
  await new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
};

const getSceneProjectionDebugDetails = (event) => {
  const command = committedEventToCommand(event);
  const payload = command?.payload || {};
  const lineId =
    typeof payload.lineId === "string"
      ? payload.lineId
      : Array.isArray(payload.lineIds) && payload.lineIds.length > 0
        ? payload.lineIds[0]
        : undefined;
  const sectionId =
    typeof payload.sectionId === "string"
      ? payload.sectionId
      : typeof payload.toSectionId === "string"
        ? payload.toSectionId
        : undefined;

  return {
    command,
    payload,
    lineId,
    sectionId,
  };
};

const formatLineLocation = (location) => {
  if (!location) {
    return undefined;
  }

  return {
    sceneId: location.sceneId,
    sectionId: location.sectionId,
  };
};

const formatSectionLocation = (location) => {
  if (!location) {
    return undefined;
  }

  return {
    sceneId: location.sceneId,
    sectionId: location.section?.id,
  };
};

const formatSceneProjectionDebugEntry = (event, repositoryState) => {
  const { command, lineId, sectionId } = getSceneProjectionDebugDetails(event);

  return {
    eventId: event?.id,
    partition: event?.partition,
    commandType: command?.type,
    lineId,
    sectionId,
    linePresent: lineId
      ? Boolean(findLineLocationInState(repositoryState, lineId))
      : undefined,
    sectionPresent: sectionId
      ? Boolean(findSectionLocationInState(repositoryState, sectionId))
      : undefined,
  };
};

const summarizeSceneProjectionLifecycle = ({ events, lineId, sectionId }) => {
  if (!lineId && !sectionId) {
    return [];
  }

  const lifecycle = [];
  for (const event of events) {
    const {
      command,
      payload,
      lineId: eventLineId,
      sectionId: eventSectionId,
    } = getSceneProjectionDebugDetails(event);

    if (command?.type === "project.create") {
      const seededState = payload?.state;
      const seededLineLocation = lineId
        ? findLineLocationInState(seededState, lineId)
        : null;
      const seededSectionLocation = sectionId
        ? findSectionLocationInState(seededState, sectionId)
        : null;

      if (!seededLineLocation && !seededSectionLocation) {
        continue;
      }

      lifecycle.push({
        eventId: event?.id,
        partition: event?.partition,
        commandType: command?.type,
        seededLineLocation: formatLineLocation(seededLineLocation),
        seededSectionLocation: formatSectionLocation(seededSectionLocation),
      });
      continue;
    }

    const lineIds = Array.isArray(payload?.lineIds) ? payload.lineIds : [];
    const sectionIds = Array.isArray(payload?.sectionIds)
      ? payload.sectionIds
      : [];
    const touchesLine =
      Boolean(lineId) && (eventLineId === lineId || lineIds.includes(lineId));
    const touchesSection =
      Boolean(sectionId) &&
      (eventSectionId === sectionId || sectionIds.includes(sectionId));

    if (!touchesLine && !touchesSection) {
      continue;
    }

    lifecycle.push({
      eventId: event?.id,
      partition: event?.partition,
      commandType: command?.type,
      lineId: eventLineId,
      lineIds: lineIds.length > 0 ? lineIds : undefined,
      sectionId: eventSectionId,
      sectionIds: sectionIds.length > 0 ? sectionIds : undefined,
    });
  }

  return lifecycle;
};

const logSceneProjectionReplayFailure = ({
  sceneId,
  event,
  index,
  events,
  mainState,
  bootstrapProjection,
  initialWorkingState,
  repositoryState,
  error,
}) => {
  const relevantHistory = [];
  const startIndex = Math.max(0, index - 8);
  const failedEvent = formatSceneProjectionDebugEntry(event, repositoryState);

  for (
    let historyIndex = startIndex;
    historyIndex <= index;
    historyIndex += 1
  ) {
    const historyEvent = events[historyIndex];
    if (!isRelevantSceneProjectionEvent({ event: historyEvent, sceneId })) {
      continue;
    }

    relevantHistory.push(
      formatSceneProjectionDebugEntry(historyEvent, repositoryState),
    );
  }

  console.error("[sceneProjection] replay failed", {
    sceneId,
    index,
    error: error?.message || "unknown",
    failedEvent,
    mainStateLineLocation: failedEvent.lineId
      ? formatLineLocation(
          findLineLocationInState(mainState, failedEvent.lineId),
        )
      : undefined,
    initialWorkingStateLineLocation: failedEvent.lineId
      ? formatLineLocation(
          findLineLocationInState(initialWorkingState, failedEvent.lineId),
        )
      : undefined,
    bootstrapProjectionLineLocation: failedEvent.lineId
      ? formatLineLocation(
          findLineLocationInState(bootstrapProjection, failedEvent.lineId),
        )
      : undefined,
    mainStateSectionLocation: failedEvent.sectionId
      ? formatSectionLocation(
          findSectionLocationInState(mainState, failedEvent.sectionId),
        )
      : undefined,
    initialWorkingStateSectionLocation: failedEvent.sectionId
      ? formatSectionLocation(
          findSectionLocationInState(
            initialWorkingState,
            failedEvent.sectionId,
          ),
        )
      : undefined,
    bootstrapProjectionSectionLocation: failedEvent.sectionId
      ? formatSectionLocation(
          findSectionLocationInState(
            bootstrapProjection,
            failedEvent.sectionId,
          ),
        )
      : undefined,
    lineLifecycle: summarizeSceneProjectionLifecycle({
      events,
      lineId: failedEvent.lineId,
      sectionId: failedEvent.sectionId,
    }),
    relevantHistory,
  });
};

const isRelevantSceneProjectionEvent = ({ event, sceneId }) => {
  if (!event || !isNonEmptyString(sceneId)) {
    return false;
  }

  if (event.partition === getScenePartition(sceneId)) {
    return true;
  }

  if (event.partition !== getMainScenePartition(sceneId)) {
    return false;
  }

  const command = committedEventToCommand(event);
  return (
    typeof command?.type === "string" &&
    (command.type.startsWith("line.") ||
      command.type.startsWith("section."))
  );
};

const isMissingSectionReplayError = (error) =>
  String(error?.message || "").includes(
    "payload.sectionId must reference an existing section",
  );

const isMissingLineReplayError = (error) =>
  String(error?.message || "").includes(
    "payload.lineId must reference an existing line",
  );

const isDuplicateSectionReplayError = (error) =>
  String(error?.message || "").includes(
    "payload.sectionId must not already exist",
  );

const isDuplicateLineReplayError = (error) =>
  String(error?.message || "").includes(
    "payload.lines.lineId must not already exist",
  );

const shouldSkipObsoleteSceneReplayEvent = ({
  event,
  repositoryState,
  error,
}) => {
  const { command, lineId, sectionId } = getSceneProjectionDebugDetails(event);
  if (command?.type?.startsWith("section.")) {
    if (isDuplicateSectionReplayError(error)) {
      return !command?.type?.endsWith(".create")
        ? false
        : Boolean(findSectionLocationInState(repositoryState, sectionId));
    }

    if (isMissingSectionReplayError(error)) {
      return !findSectionLocationInState(repositoryState, sectionId);
    }

    return false;
  }

  if (command?.type?.startsWith("line.")) {
    if (isMissingSectionReplayError(error)) {
      return !findSectionLocationInState(repositoryState, sectionId);
    }

    if (isMissingLineReplayError(error)) {
      return !findLineLocationInState(repositoryState, lineId);
    }

    if (isDuplicateLineReplayError(error)) {
      return Boolean(findLineLocationInState(repositoryState, lineId));
    }
  }

  return false;
};

const hasOnlySceneTopLevelState = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.keys(value).every((key) => key === "scenes");
};

const mergeProjectedSceneOntoMainScene = ({ mainScene, projectedScene }) => {
  if (!mainScene || !projectedScene) {
    return undefined;
  }

  const mergedScene = structuredClone(mainScene);
  const mergedSections = mergedScene?.sections?.items || {};
  const projectedSections = projectedScene?.sections?.items || {};

  for (const [sectionId, projectedSection] of Object.entries(
    projectedSections,
  )) {
    const mainSection = mergedSections?.[sectionId];
    if (!mainSection) {
      continue;
    }

    mainSection.lines = structuredClone(
      projectedSection?.lines || createEmptyLinesCollection(),
    );
  }

  return mergedScene;
};

const applyProjectedSceneToComposedState = ({
  composed,
  sceneId,
  sceneState,
}) => {
  const sceneItems = composed?.scenes?.items || {};
  const projectedScene = sceneState?.scenes?.items?.[sceneId];
  const mainScene = sceneItems?.[sceneId];
  if (!projectedScene || !mainScene) {
    return;
  }

  const mergedScene = mergeProjectedSceneOntoMainScene({
    mainScene,
    projectedScene,
  });
  if (mergedScene) {
    sceneItems[sceneId] = mergedScene;
  }
};

export const composeRepositoryState = ({
  mainState,
  activeSceneId,
  activeSceneState,
}) => {
  const composed = structuredClone(mainState);
  if (!isNonEmptyString(activeSceneId) || !activeSceneState) {
    return composed;
  }

  applyProjectedSceneToComposedState({
    composed,
    sceneId: activeSceneId,
    sceneState: activeSceneState,
  });

  return composed;
};

export const composeRepositoryStateWithScenes = ({
  mainState,
  sceneStatesBySceneId,
}) => {
  const composed = structuredClone(mainState);
  for (const [sceneId, sceneState] of sceneStatesBySceneId.entries()) {
    applyProjectedSceneToComposedState({
      composed,
      sceneId,
      sceneState,
    });
  }
  return composed;
};

export const findSectionLocationInState = (state, sectionId) => {
  const sceneItems = state?.scenes?.items || {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    const sections = scene?.sections || { items: {} };
    const section = sections.items?.[sectionId];
    if (!section) continue;
    return {
      sceneId,
      scene,
      section,
    };
  }
  return null;
};

export const findLineLocationInState = (state, lineId) => {
  const sceneItems = state?.scenes?.items || {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    const sections = scene?.sections?.items || {};
    for (const [sectionId, section] of Object.entries(sections)) {
      const line = section?.lines?.items?.[lineId];
      if (!line) continue;
      return {
        sceneId,
        sectionId,
        line,
      };
    }
  }
  return null;
};

export const loadSceneProjectionCheckpoint = async ({ store, sceneId }) =>
  store.loadMaterializedViewCheckpoint({
    viewName: SCENE_VIEW_NAME,
    partition: getScenePartition(sceneId),
  });

export const saveSceneProjectionCheckpoint = async ({
  store,
  sceneId,
  value,
  lastCommittedId,
  updatedAt,
}) => {
  await store.saveMaterializedViewCheckpoint({
    viewName: SCENE_VIEW_NAME,
    partition: getScenePartition(sceneId),
    viewVersion: SCENE_VIEW_VERSION,
    lastCommittedId,
    value,
    updatedAt,
  });
};

export const deleteSceneProjectionCheckpoint = async ({ store, sceneId }) => {
  await store.deleteMaterializedViewCheckpoint({
    viewName: SCENE_VIEW_NAME,
    partition: getScenePartition(sceneId),
  });
};

export const isSceneProjectionCheckpointFresh = ({
  checkpoint,
  latestRelevantRevision,
  sceneId,
}) =>
  checkpoint?.viewVersion === SCENE_VIEW_VERSION &&
  Number(checkpoint?.lastCommittedId || 0) === latestRelevantRevision &&
  isSceneProjectionCheckpointShapeValid({
    value: checkpoint?.value,
    sceneId,
  });

export const isSceneProjectionCheckpointShapeValid = ({ value, sceneId }) => {
  if (!isNonEmptyString(sceneId) || !hasOnlySceneTopLevelState(value)) {
    return false;
  }

  const sceneItems = value?.scenes?.items;
  if (
    !sceneItems ||
    typeof sceneItems !== "object" ||
    Array.isArray(sceneItems)
  ) {
    return false;
  }

  const sceneIds = Object.keys(sceneItems);
  if (sceneIds.length === 0) {
    return true;
  }

  return sceneIds.length === 1 && sceneIds[0] === sceneId;
};

const inspectSceneProjectionHistory = async ({
  events,
  listCommittedAfter,
  sceneId,
}) => {
  let latestRelevantRevision = 0;
  let hasProjectCreateSeed = false;
  let projectCreateEvent;

  for await (const committedBatch of iterateCommittedEventBatches({
    events,
    listCommittedAfter,
  })) {
    for (const event of committedBatch) {
      const revision = getCommittedEventRevision(event);
      const { command, payload } = getSceneProjectionDebugDetails(event);

      if (!projectCreateEvent && command?.type === "project.create") {
        projectCreateEvent = event;
      }

      if (
        command?.type === "project.create" &&
        payload?.state?.scenes?.items?.[sceneId]
      ) {
        hasProjectCreateSeed = true;
      }

      if (isRelevantSceneProjectionEvent({ event, sceneId })) {
        latestRelevantRevision = revision;
      }
    }
  }

  return {
    latestRelevantRevision,
    hasProjectCreateSeed,
    projectCreateEvent,
  };
};

export const loadSceneProjectionState = async ({
  store,
  mainState,
  events,
  listCommittedAfter,
  createInitialState,
  reduceEventToState,
  reduceEventsToState,
  sceneId,
  now = () => Date.now(),
}) => {
  const scenePartition = getScenePartition(sceneId);
  const sceneExists = Boolean(mainState?.scenes?.items?.[sceneId]);
  const emptyProjection = createSceneProjectionState(
    {
      scenes: {
        items: {},
      },
    },
    scenePartition,
  );

  const checkpoint = await loadSceneProjectionCheckpoint({
    store,
    sceneId,
  });
  const committedEvents = Array.isArray(events) ? events : undefined;
  const usingPagedCommittedHistory = committedEvents === undefined;
  if (usingPagedCommittedHistory && !listCommittedAfter) {
    throw new Error(
      "listCommittedAfter is required when scene projection loads without a full event array",
    );
  }
  const { latestRelevantRevision, hasProjectCreateSeed, projectCreateEvent } =
    usingPagedCommittedHistory
      ? await inspectSceneProjectionHistory({
          listCommittedAfter,
          sceneId,
        })
      : {
          latestRelevantRevision: getLatestSceneProjectionRevision({
            events,
            sceneId,
          }),
          hasProjectCreateSeed: committedEvents?.some((event) => {
            const { command, payload } = getSceneProjectionDebugDetails(event);
            return (
              command?.type === "project.create" &&
              Boolean(payload?.state?.scenes?.items?.[sceneId])
            );
          }),
          projectCreateEvent: committedEvents?.find((event) => {
            const { command } = getSceneProjectionDebugDetails(event);
            return command?.type === "project.create";
          }),
        };
  const checkpointFresh = isSceneProjectionCheckpointFresh({
    checkpoint,
    latestRelevantRevision,
    sceneId,
  });

  if (!sceneExists) {
    if (checkpoint) {
      await deleteSceneProjectionCheckpoint({ store, sceneId });
    }
    return emptyProjection;
  }

  if (checkpointFresh) {
    return cloneState(
      checkpoint.value,
      createSceneProjectionState(mainState, scenePartition),
    );
  }

  let bootstrapProjection;
  let replayStartIndex = 0;
  if (
    checkpoint &&
    isSceneProjectionCheckpointShapeValid({
      value: checkpoint?.value,
      sceneId,
    }) &&
    !hasProjectCreateSeed
  ) {
    bootstrapProjection = cloneState(checkpoint.value, emptyProjection);
    replayStartIndex = Math.max(
      0,
      Number.isFinite(Number(checkpoint?.lastCommittedId))
        ? Math.floor(Number(checkpoint.lastCommittedId))
        : 0,
    );
  }

  let bootstrapState = createInitialState();
  if (!bootstrapProjection) {
    if (projectCreateEvent) {
      const nextState = reduceEventToState({
        repositoryState: bootstrapState,
        event: projectCreateEvent,
      });
      if (nextState !== undefined) {
        bootstrapState = nextState;
      }
    }

    bootstrapProjection = createSceneProjectionState(
      bootstrapState,
      scenePartition,
    );
  }

  let workingState = composeRepositoryState({
    mainState,
    activeSceneId: sceneId,
    activeSceneState: bootstrapProjection || null,
  });
  const initialWorkingState = workingState;
  const replayEvents = committedEvents || [];
  const debugReplayEvents = committedEvents || [];
  const streamedDebugReplayEvents =
    committedEvents ||
    (projectCreateEvent ? [structuredClone(projectCreateEvent)] : []);
  let relevantReplayCount = 0;

  for await (const committedBatch of iterateCommittedEventBatches({
    events: committedEvents,
    listCommittedAfter,
    sinceCommittedId: replayStartIndex,
  })) {
    const relevantEventEntries = [];

    for (const event of committedBatch) {
      if (!isRelevantSceneProjectionEvent({ event, sceneId })) {
        continue;
      }

      relevantEventEntries.push({
        event,
        index: Math.max(0, getCommittedEventRevision(event) - 1),
      });
    }

    if (relevantEventEntries.length === 0) {
      continue;
    }

    if (streamedDebugReplayEvents !== debugReplayEvents) {
      streamedDebugReplayEvents.push(
        ...relevantEventEntries.map(({ event }) => structuredClone(event)),
      );
    }

    try {
      const nextState = reduceEventsToState({
        repositoryState: workingState,
        events: relevantEventEntries.map(({ event }) => event),
      });
      if (nextState !== undefined) {
        workingState = nextState;
      }
    } catch (error) {
      let recovered = false;
      for (const relevantEntry of relevantEventEntries) {
        try {
          const nextState = reduceEventToState({
            repositoryState: workingState,
            event: relevantEntry.event,
          });
          if (nextState !== undefined) {
            workingState = nextState;
          }
        } catch (sequentialError) {
          if (
            shouldSkipObsoleteSceneReplayEvent({
              event: relevantEntry.event,
              repositoryState: workingState,
              error: sequentialError,
            })
          ) {
            console.warn("[sceneProjection] skipped obsolete replay event", {
              sceneId,
              eventId: relevantEntry.event?.id,
              partition: relevantEntry.event?.partition,
              error: sequentialError?.message || "unknown",
            });
            continue;
          }

          logSceneProjectionReplayFailure({
            sceneId,
            event: relevantEntry.event,
            index: relevantEntry.index,
            events:
              streamedDebugReplayEvents === debugReplayEvents
                ? replayEvents
                : streamedDebugReplayEvents,
            mainState,
            bootstrapProjection,
            initialWorkingState,
            repositoryState: workingState,
            error: sequentialError,
          });
          throw sequentialError;
        }
      }
      recovered = true;
      if (!recovered) {
        throw error;
      }
    }

    relevantReplayCount += relevantEventEntries.length;
    if (relevantReplayCount % SCENE_PROJECTION_YIELD_INTERVAL === 0) {
      await yieldToBrowser();
    }
  }

  const nextProjection = createSceneProjectionState(
    workingState,
    scenePartition,
  );
  await saveSceneProjectionCheckpoint({
    store,
    sceneId,
    value: nextProjection,
    lastCommittedId: latestRelevantRevision,
    updatedAt: now(),
  });

  return nextProjection;
};

export const applySceneEventsToLoadedProjection = ({
  mainState,
  sceneState,
  sceneId,
  sourceEvents = [],
  reduceEventsToState,
}) => {
  if (!isNonEmptyString(sceneId)) {
    return {
      scenes: {
        items: {},
      },
    };
  }

  const scenePartition = getScenePartition(sceneId);
  let workingState = composeRepositoryState({
    mainState,
    activeSceneId: sceneId,
    activeSceneState: sceneState,
  });

  const committedEvents = Array.isArray(sourceEvents) ? sourceEvents : [];
  const relevantEvents = committedEvents.filter((event) =>
    isRelevantSceneProjectionEvent({ event, sceneId }),
  );

  if (relevantEvents.length === 0) {
    return createSceneProjectionState(workingState, scenePartition);
  }

  try {
    const nextState = reduceEventsToState({
      repositoryState: workingState,
      events: relevantEvents,
    });
    if (nextState !== undefined) {
      workingState = nextState;
    }
  } catch (error) {
    const failedRelevantIndex = Number(error?.details?.commandIndex);
    const failedEvent =
      Number.isInteger(failedRelevantIndex) &&
      failedRelevantIndex >= 0 &&
      failedRelevantIndex < relevantEvents.length
        ? relevantEvents[failedRelevantIndex]
        : relevantEvents[0];

    logSceneProjectionReplayFailure({
      sceneId,
      event: failedEvent,
      index: Math.max(0, committedEvents.indexOf(failedEvent)),
      events: committedEvents,
      repositoryState: workingState,
      error,
    });
    throw error;
  }

  return createSceneProjectionState(workingState, scenePartition);
};

export const isValidSceneId = (sceneId) => isNonEmptyString(sceneId);
