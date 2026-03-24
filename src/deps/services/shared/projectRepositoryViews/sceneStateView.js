import { scenePartitionFor } from "../collab/partitions.js";
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
  if (typeof createInitialState === "function") {
    let bootstrapState = createInitialState();
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

  let workingState = composeRepositoryState({
    mainState,
    activeSceneId: sceneId,
    activeSceneState: bootstrapProjection || null,
  });
  const committedEvents = Array.isArray(events) ? events : [];
  for (let index = 0; index < committedEvents.length; index += 1) {
    const event = committedEvents[index];
    if (!event || event.partition !== scenePartition) {
      continue;
    }

    const nextState = reduceEventToState({
      repositoryState: workingState,
      event,
    });
    if (nextState !== undefined) {
      workingState = nextState;
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
  for (const event of committedEvents) {
    if (!event || event.partition !== scenePartition) {
      continue;
    }

    const nextState = reduceEventToState({
      repositoryState: workingState,
      event,
    });
    if (nextState !== undefined) {
      workingState = nextState;
    }
  }

  return createSceneProjectionState(workingState, scenePartition);
};

export const isValidSceneId = (sceneId) => isNonEmptyString(sceneId);
