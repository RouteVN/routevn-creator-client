import { COMMAND_VERSION } from "../../domain/v2/constants.js";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmptyString = (value) =>
  typeof value === "string" && value.length > 0 ? value : null;

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
  type: "event",
  payload: {
    commandId: bootstrapId,
    schema: "project.bootstrap",
    data: {
      state: structuredClone(state),
    },
    commandVersion: COMMAND_VERSION,
    actor: structuredClone(actor || {}),
    projectId,
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
  // Bootstrap snapshots are represented as events for transport, but
  // they should be handled by committedEventToBootstrapSnapshot.
  if (schema === "project.bootstrap") {
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
  if (!payload || !isObject(payload)) {
    return null;
  }

  const isBootstrapEnvelope =
    sourceEvent?.type === "event" && payload.schema === "project.bootstrap";
  if (!isBootstrapEnvelope) {
    return null;
  }

  const snapshotState = payload?.data?.state;
  if (!isObject(snapshotState)) {
    return null;
  }

  return {
    id:
      nonEmptyString(payload.commandId || payload.bootstrapId) ||
      committedEvent?.id,
    projectId: payload.projectId || committedEvent?.project_id || null,
    state: structuredClone(snapshotState),
    actor: payload.actor || {
      userId: "unknown",
      clientId: committedEvent?.client_id,
    },
    clientTs: payload.clientTs || committedEvent?.status_updated_at,
  };
};
