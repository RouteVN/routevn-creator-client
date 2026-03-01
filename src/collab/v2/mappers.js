import { COMMAND_VERSION } from "../../domain/v2/constants.js";

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

export const snapshotToBootstrapSyncEvent = ({
  projectId,
  state,
  actor,
  bootstrapId,
  clientTs,
}) => ({
  type: "project.bootstrap",
  payload: {
    projectId,
    state: structuredClone(state),
    actor: structuredClone(actor || {}),
    bootstrapId,
    clientTs,
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

  const partitions = Array.isArray(committedEvent.partitions)
    ? committedEvent.partitions.filter(
        (partition) => typeof partition === "string" && partition.length > 0,
      )
    : [];

  return {
    id:
      typeof payload.commandId === "string" && payload.commandId.length > 0
        ? payload.commandId
        : committedEvent.id,
    projectId: payload.projectId,
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

export const committedEventToBootstrapSnapshot = (committedEvent) => {
  const sourceEvent = committedEvent?.event;
  const payload = sourceEvent?.payload;
  if (sourceEvent?.type !== "project.bootstrap") {
    return null;
  }
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (!payload.state || typeof payload.state !== "object") {
    return null;
  }

  return {
    id:
      typeof payload.bootstrapId === "string" && payload.bootstrapId.length > 0
        ? payload.bootstrapId
        : committedEvent?.id,
    projectId: payload.projectId || committedEvent?.project_id || null,
    state: structuredClone(payload.state),
    actor: payload.actor || {
      userId: "unknown",
      clientId: committedEvent?.client_id,
    },
    clientTs: payload.clientTs || committedEvent?.status_updated_at,
  };
};
