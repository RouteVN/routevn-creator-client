// Envelope versions describe storage. Model versions describe domain contracts.
// Keep strict contracts enumerated: an unknown future version is never legacy.
import {
  STRICT_COMMAND_ENVELOPE_VERSION,
  SUPPORTED_STRICT_MODEL_VERSIONS,
} from "../../../../internal/projectCompatibility.js";

const plainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

export const commandCompatibilityError = (code, path, message) => {
  const error = new Error(message);
  error.code = code;
  error.path = path;
  return error;
};
const invalid = (path, message) => {
  throw commandCompatibilityError("invalid_command_envelope", path, message);
};
const requireModelVersion = (version) => {
  if (!SUPPORTED_STRICT_MODEL_VERSIONS.includes(version)) {
    throw commandCompatibilityError(
      "unsupported_model_schema_version",
      "payload.mv",
      "This project uses an unsupported command schema version",
    );
  }
};

// Insieme 2.1.2 handles exact driver decoding before exposing stored rows.
// Incoming wire records must already use the same numeric representation.
export const readCommandEnvelopeVersion = (record) => {
  const version = record.schemaVersion;
  if (version === 1 || version === STRICT_COMMAND_ENVELOPE_VERSION)
    return version;
  throw commandCompatibilityError(
    "unsupported_command_envelope_version",
    "schemaVersion",
    "This project uses an unsupported command envelope version",
  );
};

export const decodeCommandEnvelope = (record) => {
  const version = readCommandEnvelopeVersion(record);
  if (version === 1) {
    // Deliberately do not inspect payload shape here: historical model and
    // recovery rules continue to decide whether legacy input is usable.
    const command = { ...record, schemaVersion: 1 };
    delete command.modelSchemaVersion;
    return command;
  }
  const wrapper = record.payload;
  if (!plainObject(wrapper))
    invalid("payload", "Command wrapper must be an object");
  const keys = Reflect.ownKeys(wrapper);
  if (
    keys.length !== 2 ||
    !keys.includes("mv") ||
    !keys.includes("commandPayload")
  ) {
    invalid(
      "payload",
      "Command wrapper requires exactly mv and commandPayload",
    );
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(wrapper, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      invalid(
        `payload.${key}`,
        "Command wrapper must contain JSON data properties",
      );
    }
  }
  requireModelVersion(wrapper.mv);
  if (!plainObject(wrapper.commandPayload)) {
    invalid("payload.commandPayload", "Command payload must be an object");
  }
  return {
    ...record,
    schemaVersion: STRICT_COMMAND_ENVELOPE_VERSION,
    modelSchemaVersion: wrapper.mv,
    payload: wrapper.commandPayload,
  };
};

// This encodes an accepted internal descriptor, not an external authoring API.
// The acceptance coordinator owns assigning the current versions.
export const encodeCommandEnvelope = (command) => {
  if (!Object.hasOwn(command, "modelSchemaVersion")) {
    if (command.schemaVersion !== 1) {
      invalid(
        "modelSchemaVersion",
        "Strict commands require a model schema version",
      );
    }
    return command;
  }
  requireModelVersion(command.modelSchemaVersion);
  if (command.schemaVersion !== STRICT_COMMAND_ENVELOPE_VERSION) {
    invalid("schemaVersion", "Versioned model commands require envelope 2");
  }
  if (!plainObject(command.payload))
    invalid("payload", "Command payload must be an object");
  const record = {
    ...command,
    payload: {
      mv: command.modelSchemaVersion,
      commandPayload: command.payload,
    },
  };
  delete record.modelSchemaVersion;
  return record;
};

// Atlas frame dictionaries have semantic enumeration order. Do not sort them
// for retry/ingestion identity, even if a generic sync library sorts object keys.
export const commandDomainIdentity = (record) => {
  const command = decodeCommandEnvelope(record);
  return JSON.stringify([
    command.id,
    command.partition,
    command.type,
    command.schemaVersion,
    command.modelSchemaVersion,
    command.payload,
  ]);
};
