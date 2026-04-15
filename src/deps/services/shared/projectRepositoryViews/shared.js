import {
  mainScenePartitionFor,
  mainPartitionFor,
  scenePartitionFor,
  scenePartitionTokenFor,
} from "../collab/partitions.js";
import { committedEventToCommand } from "../collab/mappers.js";

export const MAIN_VIEW_NAME = "project_repository_main_state";
export const SCENE_VIEW_NAME = "project_repository_scene_state";
export const SCENE_OVERVIEW_VIEW_NAME =
  "project_repository_scene_overview_state";
export const MAIN_VIEW_VERSION = "1";
export const SCENE_VIEW_VERSION = "2";
export const SCENE_OVERVIEW_VIEW_VERSION = "1";
export const VIEW_CHECKPOINT = {
  mode: "debounce",
  debounceMs: 1000,
  maxDirtyEvents: 100,
};
export const OVERVIEW_CHECKPOINT_DEBOUNCE_MS = 1000;
export const MAIN_PARTITION = mainPartitionFor();

export const isNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;

export const isMainPartition = (partition) => partition === MAIN_PARTITION;

export const isMainScenePartition = (partition) =>
  isNonEmptyString(partition) && partition.startsWith("m:s:");

export const isScenePartition = (partition) =>
  isNonEmptyString(partition) && partition.startsWith("s:");

export const extractSceneToken = (partition) => {
  if (isMainScenePartition(partition)) {
    return partition.slice(4);
  }

  if (isScenePartition(partition)) {
    return partition.slice(2);
  }

  return null;
};

export const createEmptyLinesCollection = () => ({
  items: {},
  tree: [],
});

export const cloneState = (value, fallback) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return structuredClone(value);
  }

  return structuredClone(fallback);
};

const forEachSceneSection = (state, callback) => {
  const sceneItems = state?.scenes?.items || {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    if (!scene || scene.type === "folder") continue;
    const sectionItems = scene?.sections?.items || {};
    for (const [sectionId, section] of Object.entries(sectionItems)) {
      if (!section || section.type === "folder") continue;
      callback({
        sceneId,
        scene,
        sectionId,
        section,
      });
    }
  }
};

export const stripSceneLinesFromState = (state, keepSceneIds = new Set()) => {
  const nextState = structuredClone(state);

  forEachSceneSection(nextState, ({ sceneId, scene, sectionId }) => {
    if (keepSceneIds.has(sceneId)) {
      return;
    }

    const targetSection = scene?.sections?.items?.[sectionId];
    if (!targetSection) {
      return;
    }

    targetSection.lines = createEmptyLinesCollection();
  });

  return nextState;
};

export const resolveSceneIdForToken = (state, token) => {
  if (!isNonEmptyString(token)) {
    return null;
  }

  const sceneItems = state?.scenes?.items || {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    if (!scene || scene.type === "folder") continue;
    if (scenePartitionTokenFor(sceneId) === token) {
      return sceneId;
    }
  }

  return null;
};

export const resolveSceneIdForPartition = (state, partition) =>
  resolveSceneIdForToken(state, extractSceneToken(partition));

export const getLatestSceneProjectionRevision = ({ events = [], sceneId }) => {
  if (!isNonEmptyString(sceneId)) {
    return 0;
  }

  const scenePartition = scenePartitionFor(sceneId);
  const mainScenePartition = mainScenePartitionFor(sceneId);
  let latestRevision = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const partition = event?.partition;
    if (partition === scenePartition) {
      latestRevision = index + 1;
      continue;
    }

    if (partition !== mainScenePartition) {
      continue;
    }

    const command = committedEventToCommand(event);
    if (typeof command?.type === "string" && command.type.startsWith("line.")) {
      latestRevision = index + 1;
    }
  }

  return latestRevision;
};

export const getLatestSceneOverviewRevision = ({ events = [], sceneId }) => {
  if (!isNonEmptyString(sceneId)) {
    return 0;
  }

  const scenePartition = scenePartitionFor(sceneId);
  const mainScenePartition = mainScenePartitionFor(sceneId);
  let latestRevision = 0;

  for (let index = 0; index < events.length; index += 1) {
    const partition = events[index]?.partition;
    if (
      partition === MAIN_PARTITION ||
      partition === scenePartition ||
      partition === mainScenePartition
    ) {
      latestRevision = index + 1;
    }
  }

  return latestRevision;
};

export const createMainProjectionState = (state) =>
  stripSceneLinesFromState(state);

export const createSceneProjectionState = (state, loadedPartition) => {
  const sceneId = resolveSceneIdForPartition(state, loadedPartition);
  const scene = sceneId ? state?.scenes?.items?.[sceneId] : undefined;
  if (!scene || scene.type === "folder") {
    return {
      scenes: {
        items: {},
      },
    };
  }

  return {
    scenes: {
      items: {
        [sceneId]: structuredClone(scene),
      },
    },
  };
};

export const toCommittedProjectEvent = ({ event, committedId, projectId }) => ({
  ...structuredClone(event),
  committedId,
  id: isNonEmptyString(event?.id)
    ? event.id
    : `repository-${projectId}-${committedId}`,
  partition: isNonEmptyString(event?.partition)
    ? event.partition
    : MAIN_PARTITION,
  projectId: event?.projectId || projectId,
  clientTs: Number.isFinite(Number(event?.clientTs))
    ? Number(event.clientTs)
    : Number.isFinite(Number(event?.meta?.clientTs))
      ? Number(event.meta.clientTs)
      : committedId,
  meta: {
    ...(event?.meta ? structuredClone(event.meta) : {}),
    clientTs: Number.isFinite(Number(event?.clientTs))
      ? Number(event.clientTs)
      : Number.isFinite(Number(event?.meta?.clientTs))
        ? Number(event.meta.clientTs)
        : committedId,
  },
  serverTs: Number.isFinite(Number(event?.serverTs))
    ? Number(event.serverTs)
    : Number.isFinite(Number(event?.clientTs))
      ? Number(event.clientTs)
      : Number.isFinite(Number(event?.meta?.clientTs))
        ? Number(event.meta.clientTs)
        : Date.now(),
});
