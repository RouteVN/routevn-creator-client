import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true });

/**
 * Default JSON schemas for each event type
 */
const schemas = {
  set: {
    type: "object",
    properties: {
      target: { type: "string", minLength: 1 },
      value: {},
      options: {
        type: "object",
        properties: { replace: { type: "boolean" } },
        additionalProperties: false,
      },
    },
    required: ["target", "value"],
    additionalProperties: false,
  },
  unset: {
    type: "object",
    properties: {
      target: { type: "string", minLength: 1 },
    },
    required: ["target"],
    additionalProperties: false,
  },
  treePush: {
    type: "object",
    properties: {
      target: { type: "string", minLength: 1 },
      value: {
        type: "object",
        properties: { id: { type: "string", minLength: 1 } },
        required: ["id"],
      },
      options: { type: "object" },
    },
    required: ["target", "value"],
    additionalProperties: false,
  },
  treeDelete: {
    type: "object",
    properties: {
      target: { type: "string", minLength: 1 },
      options: {
        type: "object",
        properties: { id: { type: "string", minLength: 1 } },
        required: ["id"],
      },
    },
    required: ["target", "options"],
    additionalProperties: false,
  },
  treeUpdate: {
    type: "object",
    properties: {
      target: { type: "string", minLength: 1 },
      value: { type: "object" },
      options: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          replace: { type: "boolean" },
        },
        required: ["id"],
      },
    },
    required: ["target", "value", "options"],
    additionalProperties: false,
  },
  treeMove: {
    type: "object",
    properties: {
      target: { type: "string", minLength: 1 },
      options: {
        type: "object",
        properties: { id: { type: "string", minLength: 1 } },
        required: ["id"],
      },
    },
    required: ["target", "options"],
    additionalProperties: false,
  },
};

/**
 * Compile validators once at module load
 * @type {Record<string, import('ajv').ValidateFunction>}
 */
const validators = Object.fromEntries(
  Object.entries(schemas).map(([type, schema]) => [type, ajv.compile(schema)]),
);

/**
 * Custom error class for event validation failures
 */
export class EventValidationError extends Error {
  /**
   * @param {string} eventType - The type of event that failed validation
   * @param {import('ajv').ErrorObject[]} errors - The validation errors from ajv
   */
  constructor(eventType, errors) {
    const details = errors
      .map((e) => `${e.instancePath || "payload"} ${e.message}`)
      .join("; ");
    super(`Event validation failed for type "${eventType}": ${details}`);
    this.name = "EventValidationError";
    /** @type {string} */
    this.eventType = eventType;
    /** @type {import('ajv').ErrorObject[]} */
    this.validationErrors = errors;
  }
}

/**
 * Validates an event payload against the schema for its type
 *
 * @param {string} eventType - The type of event (set, unset, treePush, etc.)
 * @param {unknown} payload - The event payload to validate
 * @throws {EventValidationError} If the payload does not match the schema
 */
export const validateEventPayload = (eventType, payload) => {
  const validator = validators[eventType];
  if (!validator) return; // Unknown event type, skip validation

  if (!validator(payload)) {
    throw new EventValidationError(eventType, validator.errors);
  }
};

/**
 * Test helper for validating event payloads
 * Returns true if valid, throws EventValidationError if invalid
 *
 * @param {string} eventType - The type of event (set, unset, treePush, etc.)
 * @param {unknown} payload - The event payload to validate
 * @returns {boolean} true if validation passes
 * @throws {EventValidationError} If the payload does not match the schema
 */
export const testValidateEventPayload = (eventType, payload) => {
  validateEventPayload(eventType, payload);
  return true;
};
