import {
  committedSyncEventToCommand,
  commandToSyncEvent as mapCommandToSyncEvent,
} from "insieme/client";
import { COMMAND_EVENT_MODEL } from "../../../../internal/project/commands.js";
import {
  decodeCommandEnvelope,
  encodeCommandEnvelope,
} from "./commandCodec.js";

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
  const encoded =
    Object.hasOwn(command, "modelSchemaVersion") || command.schemaVersion === 2
      ? encodeCommandEnvelope(command)
      : command;
  return mapCommandToSyncEvent(encoded, {
    defaultSchemaVersion:
      normalizeSchemaVersion(command?.schemaVersion) ??
      COMMAND_EVENT_MODEL.schemaVersion,
  });
};

export const committedEventToCommand = (committedEvent) => {
  const decoded = decodeCommandEnvelope(committedEvent);
  const command = committedSyncEventToCommand(decoded);
  if (!command) return null;
  const envelope = normalizeCommandEnvelope(command);
  if (Object.hasOwn(decoded, "modelSchemaVersion")) {
    envelope.modelSchemaVersion = decoded.modelSchemaVersion;
  }
  return envelope;
};
