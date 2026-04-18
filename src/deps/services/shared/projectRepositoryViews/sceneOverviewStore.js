import { scenePartitionFor } from "../collab/partitions.js";
import {
  SCENE_OVERVIEW_VIEW_NAME,
  SCENE_OVERVIEW_VIEW_VERSION,
} from "./shared.js";

const getSceneOverviewPartition = (sceneId) => scenePartitionFor(sceneId);

const normalizeSceneOverviewPartition = (partitionOrSceneId) => {
  if (
    typeof partitionOrSceneId === "string" &&
    partitionOrSceneId.startsWith("s:")
  ) {
    return partitionOrSceneId;
  }

  if (
    typeof partitionOrSceneId === "string" &&
    partitionOrSceneId.startsWith("m:s:")
  ) {
    return `s:${partitionOrSceneId.slice(4)}`;
  }

  return getSceneOverviewPartition(partitionOrSceneId);
};

const toCheckpointMap = ({ sceneIds = [], checkpoints = [] }) => {
  const checkpointByPartition = new Map(
    (Array.isArray(checkpoints) ? checkpoints : [])
      .filter(Boolean)
      .map((checkpoint) => [checkpoint.partition, checkpoint]),
  );
  const result = new Map();

  for (const sceneId of sceneIds) {
    const partition = getSceneOverviewPartition(sceneId);
    const checkpoint = checkpointByPartition.get(partition);
    if (checkpoint) {
      result.set(sceneId, checkpoint);
    }
  }

  return result;
};

export const loadSceneOverviewCheckpoint = async ({ store, sceneId }) =>
  store.loadMaterializedViewCheckpoint({
    viewName: SCENE_OVERVIEW_VIEW_NAME,
    partition: getSceneOverviewPartition(sceneId),
  });

export const loadSceneOverviewCheckpoints = async ({
  store,
  sceneIds = [],
}) => {
  const normalizedSceneIds = (sceneIds || []).filter(
    (sceneId) => typeof sceneId === "string" && sceneId.length > 0,
  );
  if (normalizedSceneIds.length === 0) {
    return new Map();
  }

  const checkpoints = await store.loadMaterializedViewCheckpoints({
    viewName: SCENE_OVERVIEW_VIEW_NAME,
    partitions: normalizedSceneIds.map(getSceneOverviewPartition),
  });
  return toCheckpointMap({
    sceneIds: normalizedSceneIds,
    checkpoints,
  });
};

export const saveSceneOverviewCheckpoint = async ({
  store,
  sceneId,
  value,
  lastCommittedId,
  updatedAt,
}) => {
  await store.saveMaterializedViewCheckpoint({
    viewName: SCENE_OVERVIEW_VIEW_NAME,
    partition: getSceneOverviewPartition(sceneId),
    viewVersion: SCENE_OVERVIEW_VIEW_VERSION,
    lastCommittedId,
    value,
    updatedAt,
  });
};

export const deleteSceneOverviewCheckpoint = async ({ store, sceneId }) => {
  await store.deleteMaterializedViewCheckpoint({
    viewName: SCENE_OVERVIEW_VIEW_NAME,
    partition: getSceneOverviewPartition(sceneId),
  });
};

export const deleteSceneOverviewCheckpointByPartition = async ({
  store,
  partition,
}) => {
  await store.deleteMaterializedViewCheckpoint({
    viewName: SCENE_OVERVIEW_VIEW_NAME,
    partition: normalizeSceneOverviewPartition(partition),
  });
};

export const isSceneOverviewCheckpointFresh = ({
  checkpoint,
  latestRelevantRevision,
}) =>
  checkpoint?.viewVersion === SCENE_OVERVIEW_VIEW_VERSION &&
  Number(checkpoint?.lastCommittedId || 0) === latestRelevantRevision;
