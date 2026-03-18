import { COMMAND_EVENT_MODEL } from "../../../../internal/project/commands.js";
import { buildScopePartition } from "insieme/client";

const toNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : null;

const toFiniteTimestamp = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const defaultUuid = () => {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }

  throw new Error(
    "Command id is required when crypto.randomUUID is unavailable.",
  );
};

const firstPartition = (partitions = []) => {
  return Array.isArray(partitions)
    ? partitions.find((value) => toNonEmptyString(value))
    : null;
};

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
  id,
  projectId,
  scope,
  partitions,
  type,
  payload,
  actor,
  clientTs = 0,
  schemaVersion = COMMAND_EVENT_MODEL.commandVersion,
  commandVersion = COMMAND_EVENT_MODEL.commandVersion,
  meta,
}) => {
  const basePartition =
    firstPartition(partitions) ||
    (toNonEmptyString(scope) ? partitionFor({ projectId, scope }) : null);
  if (!basePartition) {
    throw new Error("Command partitions are required");
  }
  const resolvedId = toNonEmptyString(id) || defaultUuid();

  return {
    id: resolvedId,
    projectId,
    partitions: toUniquePartitions({
      basePartition,
      partitions,
    }),
    type,
    payload,
    actor,
    clientTs: toFiniteTimestamp(clientTs, 0),
    schemaVersion,
    commandVersion,
    ...(meta !== undefined ? { meta: structuredClone(meta) } : {}),
  };
};
