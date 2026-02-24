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

const commandPayloadValidators = {
  [COMMAND_TYPES.SCENE_CREATE]: (payload, errors) => {
    requireFields(payload, ["sceneId", "name"], errors);
  },
  [COMMAND_TYPES.SCENE_RENAME]: (payload, errors) => {
    requireFields(payload, ["sceneId", "name"], errors);
  },
  [COMMAND_TYPES.SCENE_DELETE]: (payload, errors) => {
    requireFields(payload, ["sceneId"], errors);
  },
  [COMMAND_TYPES.SCENE_SET_INITIAL]: (payload, errors) => {
    requireFields(payload, ["sceneId"], errors);
  },
  [COMMAND_TYPES.SCENE_REORDER]: (payload, errors) => {
    requireFields(payload, ["sceneId", "index"], errors);
  },

  [COMMAND_TYPES.SECTION_CREATE]: (payload, errors) => {
    requireFields(payload, ["sectionId", "sceneId", "name"], errors);
  },
  [COMMAND_TYPES.SECTION_RENAME]: (payload, errors) => {
    requireFields(payload, ["sectionId", "name"], errors);
  },
  [COMMAND_TYPES.SECTION_DELETE]: (payload, errors) => {
    requireFields(payload, ["sectionId"], errors);
  },
  [COMMAND_TYPES.SECTION_REORDER]: (payload, errors) => {
    requireFields(payload, ["sectionId", "index"], errors);
  },

  [COMMAND_TYPES.LINE_INSERT_AFTER]: (payload, errors) => {
    requireFields(payload, ["lineId", "sectionId", "line"], errors);

    if (
      payload.afterLineId !== undefined &&
      payload.afterLineId !== null &&
      !assertNonEmptyString(payload.afterLineId)
    ) {
      errors.push("payload.afterLineId must be non-empty string when provided");
    }
  },
  [COMMAND_TYPES.LINE_UPDATE_ACTIONS]: (payload, errors) => {
    requireFields(payload, ["lineId", "patch"], errors);
  },
  [COMMAND_TYPES.LINE_DELETE]: (payload, errors) => {
    requireFields(payload, ["lineId"], errors);
  },
  [COMMAND_TYPES.LINE_MOVE]: (payload, errors) => {
    requireFields(payload, ["lineId", "toSectionId", "index"], errors);
  },

  [COMMAND_TYPES.RESOURCE_CREATE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId", "data"], errors);
  },
  [COMMAND_TYPES.RESOURCE_RENAME]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId", "name"], errors);
  },
  [COMMAND_TYPES.RESOURCE_MOVE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId", "index"], errors);
  },
  [COMMAND_TYPES.RESOURCE_DELETE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "resourceId"], errors);
  },
  [COMMAND_TYPES.RESOURCE_DUPLICATE]: (payload, errors) => {
    requireFields(payload, ["resourceType", "sourceId", "newId"], errors);
  },

  [COMMAND_TYPES.LAYOUT_CREATE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "name", "layoutType"], errors);
  },
  [COMMAND_TYPES.LAYOUT_RENAME]: (payload, errors) => {
    requireFields(payload, ["layoutId", "name"], errors);
  },
  [COMMAND_TYPES.LAYOUT_DELETE]: (payload, errors) => {
    requireFields(payload, ["layoutId"], errors);
  },
  [COMMAND_TYPES.LAYOUT_ELEMENT_CREATE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "elementId", "element"], errors);
  },
  [COMMAND_TYPES.LAYOUT_ELEMENT_UPDATE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "elementId", "patch"], errors);
  },
  [COMMAND_TYPES.LAYOUT_ELEMENT_MOVE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "elementId", "index"], errors);
  },
  [COMMAND_TYPES.LAYOUT_ELEMENT_DELETE]: (payload, errors) => {
    requireFields(payload, ["layoutId", "elementId"], errors);
  },

  [COMMAND_TYPES.VARIABLE_CREATE]: (payload, errors) => {
    requireFields(
      payload,
      ["variableId", "name", "variableType", "initialValue"],
      errors,
    );
  },
  [COMMAND_TYPES.VARIABLE_UPDATE]: (payload, errors) => {
    requireFields(payload, ["variableId", "patch"], errors);
  },
  [COMMAND_TYPES.VARIABLE_DELETE]: (payload, errors) => {
    requireFields(payload, ["variableId"], errors);
  },
};

const validateCommonPayloadShape = (payload, errors) => {
  if (payload.resourceType && !RESOURCE_TYPES.includes(payload.resourceType)) {
    errors.push(`Unsupported resourceType: ${payload.resourceType}`);
  }

  if (payload.index !== undefined && !Number.isInteger(payload.index)) {
    errors.push("payload.index must be integer when provided");
  }
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
