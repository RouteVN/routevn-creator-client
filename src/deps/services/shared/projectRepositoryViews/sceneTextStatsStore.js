import { scenePartitionFor } from "../collab/partitions.js";
import {
  SCENE_TEXT_STATS_VIEW_NAME,
  SCENE_TEXT_STATS_VIEW_VERSION,
} from "./shared.js";

const getSceneTextStatsPartition = (sceneId) => scenePartitionFor(sceneId);

const toCheckpointMap = ({ sceneIds = [], checkpoints = [] }) => {
  const checkpointByPartition = new Map(
    (Array.isArray(checkpoints) ? checkpoints : [])
      .filter(Boolean)
      .map((checkpoint) => [checkpoint.partition, checkpoint]),
  );
  const result = new Map();

  for (const sceneId of sceneIds) {
    const checkpoint = checkpointByPartition.get(
      getSceneTextStatsPartition(sceneId),
    );
    if (
      checkpoint?.viewVersion === SCENE_TEXT_STATS_VIEW_VERSION &&
      checkpoint.value
    ) {
      result.set(sceneId, checkpoint);
    }
  }

  return result;
};

export const loadSceneTextStatsCheckpoints = async ({
  store,
  sceneIds = [],
}) => {
  const normalizedSceneIds = sceneIds.filter(
    (sceneId) => typeof sceneId === "string" && sceneId.length > 0,
  );
  if (normalizedSceneIds.length === 0) {
    return new Map();
  }

  const checkpoints = await store.loadMaterializedViewCheckpoints({
    viewName: SCENE_TEXT_STATS_VIEW_NAME,
    partitions: normalizedSceneIds.map(getSceneTextStatsPartition),
  });
  return toCheckpointMap({
    sceneIds: normalizedSceneIds,
    checkpoints,
  });
};

export const saveSceneTextStatsCheckpoint = async ({
  store,
  sceneId,
  value,
  lastCommittedId,
  updatedAt,
}) => {
  await store.saveMaterializedViewCheckpoint({
    viewName: SCENE_TEXT_STATS_VIEW_NAME,
    partition: getSceneTextStatsPartition(sceneId),
    viewVersion: SCENE_TEXT_STATS_VIEW_VERSION,
    lastCommittedId,
    value,
    updatedAt,
  });
};

export const deleteSceneTextStatsCheckpoint = async ({ store, sceneId }) => {
  await store.deleteMaterializedViewCheckpoint({
    viewName: SCENE_TEXT_STATS_VIEW_NAME,
    partition: getSceneTextStatsPartition(sceneId),
  });
};
