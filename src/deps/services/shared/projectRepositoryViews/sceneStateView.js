import { scenePartitionFor } from "../collab/partitions.js";
import {
  SCENE_VIEW_NAME,
  SCENE_VIEW_VERSION,
  cloneState,
  createEmptyLinesCollection,
  createSceneProjectionState,
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

export const composeRepositoryState = ({ mainState, sceneStatesBySceneId }) => {
  const composed = structuredClone(mainState);
  const sceneItems = composed?.scenes?.items || {};

  for (const [sceneId, sceneState] of sceneStatesBySceneId.entries()) {
    const projectedScene = sceneState?.scenes?.items?.[sceneId];
    const mainScene = sceneItems?.[sceneId];
    if (!projectedScene || !mainScene) {
      continue;
    }

    const mergedScene = mergeProjectedSceneOntoMainScene({
      mainScene,
      projectedScene,
    });
    if (mergedScene) {
      sceneItems[sceneId] = mergedScene;
    }
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
  latestRelevantRevision = 0,
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

  const usableCheckpoint = isSceneProjectionCheckpointShapeValid({
    value: checkpoint?.value,
    sceneId,
  })
    ? checkpoint
    : null;

  if (checkpoint && !usableCheckpoint) {
    await deleteSceneProjectionCheckpoint({ store, sceneId });
  }

  let bootstrapProjection;
  let bootstrapCommittedId = 0;
  if (typeof createInitialState === "function") {
    let bootstrapState = createInitialState();
    const committedEvents = Array.isArray(events) ? events : [];
    for (let index = 0; index < committedEvents.length; index += 1) {
      const event = committedEvents[index];
      const committedId = index + 1;
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
        bootstrapCommittedId = committedId;
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
    sceneStatesBySceneId:
      usableCheckpoint?.value && usableCheckpoint?.partition === scenePartition
        ? new Map([[sceneId, usableCheckpoint.value]])
        : bootstrapProjection
          ? new Map([[sceneId, bootstrapProjection]])
          : new Map(),
  });

  const sinceCommittedId = Number(
    usableCheckpoint?.lastCommittedId || bootstrapCommittedId || 0,
  );
  const committedEvents = Array.isArray(events) ? events : [];
  for (let index = 0; index < committedEvents.length; index += 1) {
    const event = committedEvents[index];
    const committedId = index + 1;
    if (!event || event.partition !== scenePartition) {
      continue;
    }

    if (committedId <= sinceCommittedId) {
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

export const isValidSceneId = (sceneId) => isNonEmptyString(sceneId);
