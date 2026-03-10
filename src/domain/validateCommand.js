import {
  ALL_COMMAND_TYPES,
  COMMAND_TYPES,
  COMMAND_VERSION,
  RESOURCE_TYPES,
} from "./constants.js";
import { DomainValidationError } from "./errors.js";
import { assertFiniteNumber, assertNonEmptyString } from "./utils.js";

const requireFields = (payload, fields, errors, prefix = "payload") => {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      errors.push(`${prefix}.${field} is required`);
    }
  }
};

const isPlainObject = (value) => {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
};

const validateRequiredNonEmptyStringFields = (payload, fields, errors) => {
  for (const field of fields) {
    if (!assertNonEmptyString(payload?.[field])) {
      errors.push(`payload.${field} must be a non-empty string`);
    }
  }
};

const validateOptionalNullableStringField = (payload, field, errors) => {
  const value = payload?.[field];
  if (value === undefined || value === null) {
    return;
  }
  if (!assertNonEmptyString(value)) {
    errors.push(`payload.${field} must be a non-empty string when provided`);
  }
};

const validatePlainObjectField = (payload, errors, field) => {
  if (!isPlainObject(payload?.[field])) {
    errors.push(`payload.${field} must be an object`);
  }
};

const validateEnvelope = (command, errors) => {
  if (!command || typeof command !== "object") {
    errors.push("command must be an object");
    return;
  }

  if (!assertNonEmptyString(command.id)) errors.push("id is required");
  if (!assertNonEmptyString(command.projectId))
    errors.push("projectId is required");
  if (!assertNonEmptyString(command.partition))
    errors.push("partition is required");
  if (command.partitions !== undefined) {
    if (!Array.isArray(command.partitions) || command.partitions.length === 0) {
      errors.push("partitions must be a non-empty array when provided");
    } else {
      for (const partition of command.partitions) {
        if (!assertNonEmptyString(partition)) {
          errors.push("partitions entries must be non-empty strings");
          break;
        }
      }
    }
  }
  if (!assertNonEmptyString(command.type)) errors.push("type is required");
  if (command.commandVersion !== COMMAND_VERSION) {
    errors.push(`commandVersion must be ${COMMAND_VERSION}`);
  }
  if (!assertFiniteNumber(command.clientTs)) {
    errors.push("clientTs must be finite number");
  }
  if (!command.actor || typeof command.actor !== "object") {
    errors.push("actor is required");
  } else {
    if (!assertNonEmptyString(command.actor.userId)) {
      errors.push("actor.userId is required");
    }
    if (!assertNonEmptyString(command.actor.clientId)) {
      errors.push("actor.clientId is required");
    }
  }

  if (!ALL_COMMAND_TYPES.includes(command.type)) {
    errors.push(`Unsupported command type: ${command.type}`);
  }

  if (!command.payload || typeof command.payload !== "object") {
    errors.push("payload is required");
  }
};

const validatePatchObject = (payload, errors, field = "patch") => {
  validatePlainObjectField(payload, errors, field);
};

const validatePositionField = (payload, errors) => {
  const position = payload?.position;
  if (position === undefined || position === null) {
    return;
  }

  if (position === "first" || position === "last") {
    return;
  }

  if (!isPlainObject(position)) {
    errors.push(
      "payload.position must be 'first', 'last', or an object with before/after",
    );
    return;
  }

  const hasBefore = Object.prototype.hasOwnProperty.call(position, "before");
  const hasAfter = Object.prototype.hasOwnProperty.call(position, "after");

  if (hasBefore === hasAfter) {
    errors.push(
      "payload.position must contain exactly one of 'before' or 'after'",
    );
    return;
  }

  const field = hasBefore ? "before" : "after";
  if (!assertNonEmptyString(position[field])) {
    errors.push(`payload.position.${field} must be a non-empty string`);
  }
};

const validateReplaceFlag = (payload, errors) => {
  if (payload?.replace !== undefined && typeof payload.replace !== "boolean") {
    errors.push("payload.replace must be a boolean when provided");
  }
};

const commandPayloadValidators = {
  [COMMAND_TYPES.PROJECT_CREATED]: (payload, errors) => {
    requireFields(payload, ["state"], errors);
    validatePlainObjectField(payload, errors, "state");
  },
  [COMMAND_TYPES.PROJECT_UPDATE]: (payload, errors) => {
    requireFields(payload, ["patch"], errors);
    validatePatchObject(payload, errors);
  },

  [COMMAND_TYPES.SCENE_CREATE]: (payload, errors) => {
    requireFields(payload, ["sceneId", "name"], errors);
    validateRequiredNonEmptyStringFields(payload, ["sceneId", "name"], errors);
    validateOptionalNullableStringField(payload, "parentId", errors);
    if (payload?.data !== undefined) {
      validatePlainObjectField(payload, errors, "data");
    }
  },
  [COMMAND_TYPES.SCENE_UPDATE]: (payload, errors) => {
    requireFields(payload, ["sceneId", "patch"], errors);
    validateRequiredNonEmptyStringFields(payload, ["sceneId"], errors);
    validatePatchObject(payload, errors);
  },
  [COMMAND_TYPES.SCENE_RENAME]: (payload, errors) => {
    requireFields(payload, ["sceneId", "name"], errors);
    validateRequiredNonEmptyStringFields(payload, ["sceneId", "name"], errors);
  },
  [COMMAND_TYPES.SCENE_DELETE]: (payload, errors) => {
    requireFields(payload, ["sceneId"], errors);
    validateRequiredNonEmptyStringFields(payload, ["sceneId"], errors);
  },
  [COMMAND_TYPES.SCENE_SET_INITIAL]: (payload, errors) => {
    requireFields(payload, ["sceneId"], errors);
    validateRequiredNonEmptyStringFields(payload, ["sceneId"], errors);
  },
  [COMMAND_TYPES.SCENE_MOVE]: (payload, errors) => {
    requireFields(payload, ["sceneId", "index"], errors);
    validateRequiredNonEmptyStringFields(payload, ["sceneId"], errors);
    validateOptionalNullableStringField(payload, "parentId", errors);
  },

  [COMMAND_TYPES.SECTION_CREATE]: (payload, errors) => {
    requireFields(payload, ["sectionId", "sceneId", "name"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["sectionId", "sceneId", "name"],
      errors,
    );
    validateOptionalNullableStringField(payload, "parentId", errors);
    if (payload?.data !== undefined) {
      validatePlainObjectField(payload, errors, "data");
    }
  },
  [COMMAND_TYPES.SECTION_RENAME]: (payload, errors) => {
    requireFields(payload, ["sectionId", "name"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["sectionId", "name"],
      errors,
    );
  },
  [COMMAND_TYPES.SECTION_DELETE]: (payload, errors) => {
    requireFields(payload, ["sectionId"], errors);
    validateRequiredNonEmptyStringFields(payload, ["sectionId"], errors);
  },
  [COMMAND_TYPES.SECTION_REORDER]: (payload, errors) => {
    requireFields(payload, ["sectionId", "index"], errors);
    validateRequiredNonEmptyStringFields(payload, ["sectionId"], errors);
    validateOptionalNullableStringField(payload, "parentId", errors);
  },

  [COMMAND_TYPES.LINE_INSERT_AFTER]: (payload, errors) => {
    requireFields(payload, ["lineId", "sectionId", "line"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["lineId", "sectionId"],
      errors,
    );
    validatePlainObjectField(payload, errors, "line");
    validateOptionalNullableStringField(payload, "afterLineId", errors);
    validateOptionalNullableStringField(payload, "parentId", errors);
  },
  [COMMAND_TYPES.LINE_UPDATE_ACTIONS]: (payload, errors) => {
    requireFields(payload, ["lineId", "patch"], errors);
    validateRequiredNonEmptyStringFields(payload, ["lineId"], errors);
    validatePatchObject(payload, errors);
    validateReplaceFlag(payload, errors);
  },
  [COMMAND_TYPES.LINE_DELETE]: (payload, errors) => {
    requireFields(payload, ["lineId"], errors);
    validateRequiredNonEmptyStringFields(payload, ["lineId"], errors);
  },
  [COMMAND_TYPES.LINE_MOVE]: (payload, errors) => {
    requireFields(payload, ["lineId", "toSectionId", "index"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["lineId", "toSectionId"],
      errors,
    );
    validateOptionalNullableStringField(payload, "parentId", errors);
  },

  [COMMAND_TYPES.RESOURCE_CREATE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId", "data"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["resourceType", "resourceId"],
      errors,
    );
    validatePlainObjectField(payload, errors, "data");
    validateOptionalNullableStringField(payload, "parentId", errors);
  },
  [COMMAND_TYPES.RESOURCE_UPDATE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId", "patch"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["resourceType", "resourceId"],
      errors,
    );
    validatePatchObject(payload, errors);
  },
  [COMMAND_TYPES.RESOURCE_RENAME]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId", "name"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["resourceType", "resourceId", "name"],
      errors,
    );
  },
  [COMMAND_TYPES.RESOURCE_MOVE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId", "index"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["resourceType", "resourceId"],
      errors,
    );
    validateOptionalNullableStringField(payload, "parentId", errors);
  },
  [COMMAND_TYPES.RESOURCE_DELETE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["resourceType", "resourceId"],
      errors,
    );
  },
  [COMMAND_TYPES.RESOURCE_DUPLICATE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "sourceId", "newId"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["resourceType", "sourceId", "newId"],
      errors,
    );
    validateOptionalNullableStringField(payload, "parentId", errors);
    if (payload?.name !== undefined && !assertNonEmptyString(payload.name)) {
      errors.push("payload.name must be a non-empty string when provided");
    }
  },

  [COMMAND_TYPES.LAYOUT_ELEMENT_CREATE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "elementId", "element"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["layoutId", "elementId"],
      errors,
    );
    validatePlainObjectField(payload, errors, "element");
    validateOptionalNullableStringField(payload, "parentId", errors);
  },
  [COMMAND_TYPES.LAYOUT_ELEMENT_UPDATE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "elementId", "patch"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["layoutId", "elementId"],
      errors,
    );
    validatePatchObject(payload, errors);
    validateReplaceFlag(payload, errors);
  },
  [COMMAND_TYPES.LAYOUT_ELEMENT_MOVE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "elementId", "index"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["layoutId", "elementId"],
      errors,
    );
    validateOptionalNullableStringField(payload, "parentId", errors);
  },
  [COMMAND_TYPES.LAYOUT_ELEMENT_DELETE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "elementId"], errors);
    validateRequiredNonEmptyStringFields(
      payload,
      ["layoutId", "elementId"],
      errors,
    );
  },
};

const validateCommonPayloadShape = (payload, errors) => {
  if (payload.resourceType && !RESOURCE_TYPES.includes(payload.resourceType)) {
    errors.push(`Unsupported resourceType: ${payload.resourceType}`);
  }

  if (payload.index !== undefined && !Number.isInteger(payload.index)) {
    errors.push("payload.index must be integer when provided");
  }

  validatePositionField(payload, errors);
};

export const validateCommand = (command) => {
  const errors = [];

  validateEnvelope(command, errors);
  if (!command || !command.payload || typeof command.payload !== "object") {
    throw new DomainValidationError("Invalid command envelope", { errors });
  }

  const payloadValidator = commandPayloadValidators[command.type];
  if (payloadValidator) {
    payloadValidator(command.payload, errors);
  }

  validateCommonPayloadShape(command.payload, errors);

  if (errors.length > 0) {
    throw new DomainValidationError("Command validation failed", { errors });
  }

  return true;
};
