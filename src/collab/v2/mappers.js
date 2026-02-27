import { COMMAND_VERSION } from "../../domain/v2/constants.js";
import { commandToEvent } from "../../domain/v2/mapper.js";

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const toEventMeta = ({ committedEvent, sourceMeta }) => {
  const rawMeta =
    sourceMeta && typeof sourceMeta === "object" ? sourceMeta : {};
  const fallbackTs = isFiniteNumber(committedEvent?.status_updated_at)
    ? Number(committedEvent.status_updated_at)
    : Date.now();
  const ts = isFiniteNumber(rawMeta.ts) ? Number(rawMeta.ts) : fallbackTs;
  const actor =
    rawMeta.actor && typeof rawMeta.actor === "object"
      ? structuredClone(rawMeta.actor)
      : {
          userId: "unknown",
          clientId: committedEvent?.client_id || "unknown",
        };

  return {
    ...structuredClone(rawMeta),
    commandId:
      typeof rawMeta.commandId === "string" && rawMeta.commandId.length > 0
        ? rawMeta.commandId
        : committedEvent?.id || "",
    projectId:
      typeof rawMeta.projectId === "string" && rawMeta.projectId.length > 0
        ? rawMeta.projectId
        : committedEvent?.project_id || null,
    actor,
    ts,
  };
};

export const commandToSyncEvent = (command) => {
  return {
    type: "event",
    payload: {
      commandId: command.id,
      schema: command.type,
      data: structuredClone(command.payload || {}),
      commandVersion: command.commandVersion ?? COMMAND_VERSION,
      actor: structuredClone(command.actor || {}),
      projectId: command.projectId,
      clientTs: command.clientTs,
    },
  };
};

export const committedEventToDomainEvent = (committedEvent) => {
  const sourceEvent = committedEvent?.event;
  if (!sourceEvent || typeof sourceEvent !== "object") {
    return null;
  }

  const eventType = sourceEvent.type;
  if (typeof eventType !== "string" || eventType.length === 0) {
    return null;
  }

  if (eventType === "event") {
    const payload =
      sourceEvent.payload && typeof sourceEvent.payload === "object"
        ? sourceEvent.payload
        : null;
    if (
      !payload ||
      typeof payload.schema !== "string" ||
      payload.schema.length === 0
    ) {
      return null;
    }
    const partitions = Array.isArray(committedEvent?.partitions)
      ? committedEvent.partitions.filter(
          (partition) => typeof partition === "string" && partition.length > 0,
        )
      : [];
    const projectId =
      typeof payload.projectId === "string" && payload.projectId.length > 0
        ? payload.projectId
        : committedEvent?.project_id || null;
    const command = {
      id:
        (typeof payload.commandId === "string" && payload.commandId.length > 0
          ? payload.commandId
          : committedEvent?.id) || "",
      projectId,
      partition:
        partitions[0] ||
        (projectId ? `project:${projectId}:story` : "project:unknown:story"),
      partitions,
      type: payload.schema,
      payload:
        payload.data && typeof payload.data === "object"
          ? structuredClone(payload.data)
          : {},
      commandVersion: Number.isFinite(Number(payload.commandVersion))
        ? Number(payload.commandVersion)
        : COMMAND_VERSION,
      actor:
        payload.actor && typeof payload.actor === "object"
          ? structuredClone(payload.actor)
          : {
              userId: "unknown",
              clientId: committedEvent?.client_id || "unknown",
            },
      clientTs: isFiniteNumber(payload.clientTs)
        ? Number(payload.clientTs)
        : isFiniteNumber(committedEvent?.status_updated_at)
          ? Number(committedEvent.status_updated_at)
          : Date.now(),
    };
    return commandToEvent(command);
  }

  const payload =
    sourceEvent.payload && typeof sourceEvent.payload === "object"
      ? structuredClone(sourceEvent.payload)
      : {};

  return {
    type: eventType,
    payload,
    meta: toEventMeta({
      committedEvent,
      sourceMeta: sourceEvent.meta,
    }),
  };
};
