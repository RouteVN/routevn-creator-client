import {
  committedSyncEventToCommand,
  commandToSyncEvent as mapCommandToSyncEvent,
} from "insieme/client";
import { COMMAND_EVENT_MODEL } from "../../../../internal/project/commands.js";

const normalizeSchemaVersion = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
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
  return mapCommandToSyncEvent(command, {
    defaultSchemaVersion:
      normalizeSchemaVersion(command?.schemaVersion) ??
      COMMAND_EVENT_MODEL.schemaVersion,
  });
};

export const committedEventToCommand = (committedEvent) => {
  const command = committedSyncEventToCommand(committedEvent);
  if (!command) return null;

  return normalizeCommandEnvelope(command);
};
