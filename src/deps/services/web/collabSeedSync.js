import { snapshotToBootstrapSyncEvent } from "../../../collab/v2/mappers.js";
import { nanoid } from "nanoid";

const normalizePartitions = (partitions, fallbackPartitions = []) => {
  const output = [];
  const seen = new Set();
  const addPartition = (partition) => {
    if (typeof partition !== "string" || partition.length === 0) return;
    if (seen.has(partition)) return;
    seen.add(partition);
    output.push(partition);
  };

  for (const partition of Array.isArray(partitions) ? partitions : []) {
    addPartition(partition);
  }
  if (output.length === 0) {
    for (const partition of Array.isArray(fallbackPartitions)
      ? fallbackPartitions
      : []) {
      addPartition(partition);
    }
  }
  return output;
};

const buildBootstrapId = () => `bootstrap-${nanoid()}`;

const findLatestTypedSnapshotState = (typedEvents = []) => {
  for (let index = typedEvents.length - 1; index >= 0; index -= 1) {
    const typedEvent = typedEvents[index];
    if (typedEvent?.type !== "typedSnapshot") continue;
    const snapshotState = typedEvent?.payload?.state;
    if (snapshotState && typeof snapshotState === "object") {
      return snapshotState;
    }
  }
  return null;
};

const resolveBootstrapPartitions = ({
  projectId,
  fallbackPartitions,
  partitioning,
}) => {
  const normalizedFallback = normalizePartitions(fallbackPartitions);
  if (normalizedFallback.length > 0) {
    return normalizedFallback;
  }
  if (typeof partitioning?.getBasePartitions === "function") {
    return normalizePartitions(partitioning.getBasePartitions(projectId));
  }
  if (typeof partitioning?.storyBasePartitionFor === "function") {
    return normalizePartitions([partitioning.storyBasePartitionFor(projectId)]);
  }
  return [];
};

export const buildSeedSyncEventsFromTypedEvents = ({
  typedEvents,
  projectId,
  actor,
  fallbackPartitions,
  partitioning,
}) => {
  const sourceEvents = Array.isArray(typedEvents) ? typedEvents : [];
  const snapshotState = findLatestTypedSnapshotState(sourceEvents);

  const summary = {
    sourceTypedEvents: sourceEvents.length,
    bootstrapEvents: 0,
    skippedMissingSnapshot: snapshotState ? 0 : 1,
    skippedBootstrapOnlySnapshot: 0,
  };

  if (!snapshotState) {
    return { seedEvents: [], summary };
  }

  const partitions = resolveBootstrapPartitions({
    projectId,
    fallbackPartitions,
    partitioning,
  });
  if (partitions.length === 0) {
    return { seedEvents: [], summary };
  }

  const bootstrapId = buildBootstrapId();

  return {
    seedEvents: [
      {
        commandId: bootstrapId,
        partitions,
        event: snapshotToBootstrapSyncEvent({
          projectId,
          state: snapshotState,
          actor,
          bootstrapId,
          clientTs: Date.now(),
        }),
      },
    ],
    summary: {
      ...summary,
      bootstrapEvents: 1,
    },
  };
};
