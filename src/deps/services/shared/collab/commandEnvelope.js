import { COMMAND_EVENT_MODEL } from "../../../../internal/project/commands.js";

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

export const createCommandEnvelope = ({
  id,
  projectId,
  partition,
  type,
  payload,
  actor,
  clientTs = 0,
  schemaVersion = COMMAND_EVENT_MODEL.schemaVersion,
  meta,
}) => {
  const resolvedPartition = toNonEmptyString(partition);
  if (!resolvedPartition) {
    throw new Error("Command partition is required");
  }

  const resolvedId = toNonEmptyString(id) || defaultUuid();

  return {
    id: resolvedId,
    projectId,
    partition: resolvedPartition,
    type,
    payload,
    actor,
    clientTs: toFiniteTimestamp(clientTs, 0),
    schemaVersion,
    ...(meta !== undefined ? { meta: structuredClone(meta) } : {}),
  };
};
