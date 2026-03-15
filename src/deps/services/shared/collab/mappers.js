import {
  committedSyncEventToCommand,
  commandToSyncEvent as mapCommandToSyncEvent,
} from "insieme/client";
import {
  COMMAND_EVENT_MODEL,
  normalizeCommand,
} from "../../../../internal/project/commands.js";

const normalizeCommandVersion = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
};

export const getCommittedEventCommandVersion = (committedEvent) => {
  return (
    normalizeCommandVersion(committedEvent?.meta?.commandVersion) ??
    COMMAND_EVENT_MODEL.commandVersion
  );
};

const COMMAND_ENVELOPE_FIELDS = new Set([
  ...COMMAND_EVENT_MODEL.requiredEnvelopeFields,
  ...COMMAND_EVENT_MODEL.optionalEnvelopeFields,
]);

const normalizeCommandEnvelope = (command) => {
  return Object.fromEntries(
    Object.entries(command || {}).filter(([fieldName]) =>
      COMMAND_ENVELOPE_FIELDS.has(fieldName),
    ),
  );
};

export const commandToSyncEvent = (command) => {
  const normalizedCommand = normalizeCommand(command);
  const event = mapCommandToSyncEvent(normalizedCommand);
  const commandVersion =
    normalizeCommandVersion(normalizedCommand?.commandVersion) ??
    COMMAND_EVENT_MODEL.commandVersion;

  return {
    ...event,
    meta: {
      ...(event?.meta ? structuredClone(event.meta) : {}),
      commandVersion,
    },
  };
};

export const committedEventToCommand = (committedEvent) => {
  const commandVersion = getCommittedEventCommandVersion(committedEvent);
  const command = committedSyncEventToCommand(committedEvent, {
    defaultCommandVersion: commandVersion,
  });
  if (!command) return null;

  return normalizeCommand({
    ...normalizeCommandEnvelope(command),
    commandVersion,
  });
};
