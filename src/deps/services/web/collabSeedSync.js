import { snapshotToBootstrapSyncEvent } from "../../../collab/v2/mappers.js";
import { nanoid } from "nanoid";

const normalizePartitions = (partitions) =>
  Array.from(
    new Set(
      (Array.isArray(partitions) ? partitions : []).filter(
        (partition) => typeof partition === "string" && partition.length > 0,
      ),
    ),
  );

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

export const buildBootstrapSeedEvent = ({
  typedEvents,
  projectId,
  actor,
  partitions,
}) => {
  const sourceEvents = Array.isArray(typedEvents) ? typedEvents : [];
  const snapshotState = findLatestTypedSnapshotState(sourceEvents);

  if (!snapshotState) {
    return null;
  }

  const normalizedPartitions = normalizePartitions(partitions);
  if (normalizedPartitions.length === 0) {
    return null;
  }

  const bootstrapId = buildBootstrapId();

  return {
    bootstrapId,
    partitions: normalizedPartitions,
    event: snapshotToBootstrapSyncEvent({
      projectId,
      state: snapshotState,
      actor,
      bootstrapId,
      clientTs: Date.now(),
    }),
  };
};
