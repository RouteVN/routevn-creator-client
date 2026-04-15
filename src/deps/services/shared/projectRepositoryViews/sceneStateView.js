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
  getLatestSceneProjectionRevision,
  isNonEmptyString,
} from "./shared.js";

const getScenePartition = (sceneId) => scenePartitionFor(sceneId);
const getMainScenePartition = (sceneId) => mainScenePartitionFor(sceneId);

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
  return typeof command?.type === "string" && command.type.startsWith("line.");
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
  store.loadMaterializedViewCheckpoint?.({
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
  await store.saveMaterializedViewCheckpoint?.({
    viewName: SCENE_VIEW_NAME,
    partition: getScenePartition(sceneId),
    viewVersion: SCENE_VIEW_VERSION,
    lastCommittedId,
    value,
    updatedAt,
  });
};

export const deleteSceneProjectionCheckpoint = async ({ store, sceneId }) => {
  await store.deleteMaterializedViewCheckpoint?.({
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

const hasSceneSeedInProjectCreateEvents = ({ events = [], sceneId }) => {
  if (!isNonEmptyString(sceneId)) {
    return false;
  }

  for (const event of events || []) {
    const { command, payload } = getSceneProjectionDebugDetails(event);
    if (command?.type !== "project.create") {
      continue;
    }

    if (payload?.state?.scenes?.items?.[sceneId]) {
      return true;
    }
  }

  return false;
};

export const loadSceneProjectionState = async ({
  store,
  mainState,
  events = [],
  createInitialState,
  reduceEventToState,
  sceneId,
  now = () => Date.now(),
}) => {
  const scenePartition = getScenePartition(sceneId);
  const sceneExists = Boolean(mainState?.scenes?.items?.[sceneId]);
  const latestRelevantRevision = getLatestSceneProjectionRevision({
    events,
    sceneId,
  });
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
  const hasProjectCreateSeed = hasSceneSeedInProjectCreateEvents({
    events,
    sceneId,
  });

  if (!sceneExists) {
    if (checkpoint) {
      await deleteSceneProjectionCheckpoint({ store, sceneId });
    }
    return emptyProjection;
  }

  if (
    isSceneProjectionCheckpointFresh({
      checkpoint,
      latestRelevantRevision,
      sceneId,
    })
  ) {
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

  if (typeof createInitialState === "function") {
    let bootstrapState = createInitialState();
    if (!bootstrapProjection) {
      const committedEvents = Array.isArray(events) ? events : [];
      for (let index = 0; index < committedEvents.length; index += 1) {
        const event = committedEvents[index];
        if (!event) {
          continue;
        }

        if (event.type !== "project.create") {
          continue;
        }

        const nextState = reduceEventToState({
          repositoryState: bootstrapState,
          event,
        });
        if (nextState !== undefined) {
          bootstrapState = nextState;
        }

        break;
      }

      bootstrapProjection = createSceneProjectionState(
        bootstrapState,
        scenePartition,
      );
    }
  }

  let workingState = composeRepositoryState({
    mainState,
    activeSceneId: sceneId,
    activeSceneState: bootstrapProjection || null,
  });
  const initialWorkingState = workingState;
  const committedEvents = Array.isArray(events) ? events : [];
  for (
    let index = replayStartIndex;
    index < committedEvents.length;
    index += 1
  ) {
    const event = committedEvents[index];
    if (!isRelevantSceneProjectionEvent({ event, sceneId })) {
      continue;
    }

    try {
      const nextState = reduceEventToState({
        repositoryState: workingState,
        event,
      });
      if (nextState !== undefined) {
        workingState = nextState;
      }
    } catch (error) {
      logSceneProjectionReplayFailure({
        sceneId,
        event,
        index,
        events: committedEvents,
        mainState,
        bootstrapProjection,
        initialWorkingState,
        repositoryState: workingState,
        error,
      });
      throw error;
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
  reduceEventToState,
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
  for (let index = 0; index < committedEvents.length; index += 1) {
    const event = committedEvents[index];
    if (!isRelevantSceneProjectionEvent({ event, sceneId })) {
      continue;
    }

    try {
      const nextState = reduceEventToState({
        repositoryState: workingState,
        event,
      });
      if (nextState !== undefined) {
        workingState = nextState;
      }
    } catch (error) {
      logSceneProjectionReplayFailure({
        sceneId,
        event,
        index,
        events: committedEvents,
        repositoryState: workingState,
        error,
      });
      throw error;
    }
  }

  return createSceneProjectionState(workingState, scenePartition);
};

export const isValidSceneId = (sceneId) => isNonEmptyString(sceneId);
