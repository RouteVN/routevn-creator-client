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

// SQLite drivers can expose integer columns as strings or bigints. Conversion
// must be lossless; Number()/parseInt() alone would accept fractions/prefixes.
const driverInteger = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value === "bigint") {
    return value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : undefined;
  }
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number) && String(number) === value) return number;
  }
  return undefined;
};

export const readCommandEnvelopeVersion = (record) => {
  const stored = Object.hasOwn(record, "rawSchemaVersion");
  const raw = stored ? record.rawSchemaVersion : record.schemaVersion;
  const exact = stored
    ? driverInteger(raw)
    : typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0
      ? raw
      : undefined;
  if (exact === 1 || exact === STRICT_COMMAND_ENVELOPE_VERSION) return exact;
  // Only a stored row already interpreted as envelope 1 by its old reader
  // receives historical tolerance. This never promotes malformed data to 2.
  if (
    stored &&
    record.schemaVersion === 1 &&
    ["number", "string", "bigint"].includes(typeof raw) &&
    Number.parseInt(raw, 10) === 1
  ) {
    return 1;
  }
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
  delete record.rawSchemaVersion;
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
