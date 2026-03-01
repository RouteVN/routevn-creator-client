import { COMMAND_VERSION } from "../../domain/v2/constants.js";
import { buildScopePartition } from "insieme/client";

const defaultUuid = () =>
  typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const toNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : null;

export const partitionFor = ({ projectId, scope }) => {
  const normalizedProjectId = toNonEmptyString(projectId);
  const normalizedScope = toNonEmptyString(scope);
  if (!normalizedProjectId || !normalizedScope) {
    return `project:${projectId}:${scope}`;
  }
  return buildScopePartition({
    scope: "project",
    scopeId: normalizedProjectId,
    path: [normalizedScope],
  });
};

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
