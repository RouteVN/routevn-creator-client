import { COMMAND_VERSION } from "../../domain/v2/constants.js";

const defaultUuid = () =>
  typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const partitionFor = ({ projectId, scope }) =>
  `project:${projectId}:${scope}`;

const toNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : null;

const toUniquePartitions = ({ basePartition, partitions = [] }) => {
  const seen = new Set();
  const output = [];

  const push = (value) => {
    const normalized = toNonEmptyString(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    output.push(normalized);
  };

  push(basePartition);
  for (const partition of partitions) push(partition);

  return output;
};

export const createCommandEnvelope = ({
  id = defaultUuid(),
  projectId,
  scope,
  partition,
  partitions,
  type,
  payload,
  actor,
  clientTs = Date.now(),
  commandVersion = COMMAND_VERSION,
}) => {
  const basePartition =
    toNonEmptyString(partition) || partitionFor({ projectId, scope });

  return {
    id,
    projectId,
    partition: basePartition,
    partitions: toUniquePartitions({
      basePartition,
      partitions,
    }),
    type,
    payload,
    actor,
    clientTs,
    commandVersion,
  };
};
