import { COMMAND_VERSION } from "../../domain/v2/constants.js";

const nonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : null;
const committedEventPartitions = (committedEvent) =>
  Array.isArray(committedEvent?.partitions)
    ? committedEvent.partitions.filter(
        (partition) => typeof partition === "string" && partition.length > 0,
      )
    : [];
const projectIdFromPartitions = (partitions) => {
  for (const partition of partitions) {
    const match = /^project:([^:]+):/.exec(partition);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

export const commandToSyncEvent = (command) => ({
  type: "event",
  payload: {
    commandId: command.id,
    schema: command.type,
    data: structuredClone(command.payload),
    commandVersion: command.commandVersion,
    actor: structuredClone(command.actor),
    projectId: command.projectId,
    clientTs: command.clientTs,
  },
});

export const committedEventToCommand = (committedEvent) => {
  const payload = committedEvent?.event?.payload;
  if (!payload || committedEvent?.event?.type !== "event") {
    return null;
  }

  const schema = payload.schema;
  const data = payload.data;
  if (typeof schema !== "string" || !data || typeof data !== "object") {
    return null;
  }

  const partitions = committedEventPartitions(committedEvent);
  const resolvedProjectId =
    nonEmptyString(payload.projectId) ||
    nonEmptyString(committedEvent?.project_id) ||
    projectIdFromPartitions(partitions);

  return {
    id:
      typeof payload.commandId === "string" && payload.commandId.length > 0
        ? payload.commandId
        : committedEvent.id,
    projectId: resolvedProjectId,
    partition: partitions[0],
    partitions,
    type: schema,
    payload: structuredClone(data),
    commandVersion: payload.commandVersion ?? COMMAND_VERSION,
    actor: payload.actor || {
      userId: "unknown",
      clientId: committedEvent.client_id,
    },
    clientTs: payload.clientTs || committedEvent.status_updated_at,
  };
};
