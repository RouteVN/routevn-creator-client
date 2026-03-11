export const MODEL_VERSION = 2;
export const PROTOCOL_VERSION = "1.0";
export const COMMAND_VERSION = 1;

export const PARTITIONS = {
  STORY: "story",
  RESOURCES: "resources",
  LAYOUTS: "layouts",
  SETTINGS: "settings",
};

export const RESOURCE_TYPES = [
  "images",
  "tweens",
  "videos",
  "sounds",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "typography",
  "variables",
  "layouts",
  "components",
];

export class DomainValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DomainValidationError";
    this.code = "validation_failed";
    this.details = details;
  }
}

export class DomainInvariantError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DomainInvariantError";
    this.code = "validation_failed";
    this.details = details;
  }
}

export class DomainPreconditionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DomainPreconditionError";
    this.code = "validation_failed";
    this.details = details;
  }
}

export const deepClone = (value) => structuredClone(value);

export const assertFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export const assertNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const insertAtIndex = (array, value, index) => {
  if (!Array.isArray(array)) throw new Error("insertAtIndex expects array");
  if (index === undefined || index === null || index >= array.length) {
    array.push(value);
    return;
  }
  if (index <= 0) {
    array.unshift(value);
    return;
  }
  array.splice(index, 0, value);
};

export const removeFromArray = (array, value) => {
  const idx = array.indexOf(value);
  if (idx >= 0) array.splice(idx, 1);
};

export const upsertNoDuplicate = (array, value, index) => {
  removeFromArray(array, value);
  insertAtIndex(array, value, index);
};

export const normalizeIndex = (index) => {
  if (!Number.isInteger(index)) return undefined;
  return Math.max(0, index);
};

const isPlainObject = (value) => {
  return (
    value !== undefined &&
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
};

const assertPrecondition = (condition, message, details = {}) => {
  if (!condition) {
    throw new DomainPreconditionError(message, details);
  }
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

const validateOptionalStringField = (payload, field, errors) => {
  if (payload?.[field] !== undefined && !assertNonEmptyString(payload[field])) {
    errors.push(`payload.${field} must be a non-empty string when provided`);
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

const validatePlainObjectField = (payload, field, errors) => {
  if (!isPlainObject(payload?.[field])) {
    errors.push(`payload.${field} must be an object`);
  }
};

const validateOptionalPlainObjectField = (payload, field, errors) => {
  if (payload?.[field] === undefined) {
    return;
  }
  validatePlainObjectField(payload, field, errors);
};

const validateOptionalBooleanField = (payload, field, errors) => {
  if (payload?.[field] !== undefined && typeof payload[field] !== "boolean") {
    errors.push(`payload.${field} must be a boolean when provided`);
  }
};

const assertSceneExists = (state, sceneId, details = {}) => {
  assertPrecondition(!!state.scenes?.[sceneId], "scene not found", {
    sceneId,
    ...details,
  });
};

const assertSceneFolderParent = (state, sceneId, parentId) => {
  assertPrecondition(parentId !== sceneId, "scene cannot parent itself", {
    sceneId,
    parentId,
  });
  assertSceneExists(state, parentId, { parentId });
  assertPrecondition(
    state.scenes[parentId].type === "folder",
    "scene parent must be folder",
    {
      sceneId,
      parentId,
      parentType: state.scenes[parentId].type,
    },
  );
};

const assertSectionExists = (state, sectionId, details = {}) => {
  assertPrecondition(!!state.sections?.[sectionId], "section not found", {
    sectionId,
    ...details,
  });
};

const assertLineExists = (state, lineId, details = {}) => {
  assertPrecondition(!!state.lines?.[lineId], "line not found", {
    lineId,
    ...details,
  });
};

const assertResourceExists = (
  state,
  resourceType,
  resourceId,
  details = {},
) => {
  assertPrecondition(
    !!state.resources?.[resourceType]?.items?.[resourceId],
    "resource not found",
    {
      resourceType,
      resourceId,
      ...details,
    },
  );
};

const assertLayoutExists = (state, layoutId) => {
  assertPrecondition(
    !!state.resources?.layouts?.items?.[layoutId],
    "layout not found",
    { layoutId },
  );
};

const assertLayoutElementExists = (state, layoutId, elementId) => {
  assertLayoutExists(state, layoutId);
  assertPrecondition(
    !!state.resources.layouts.items[layoutId].elements?.[elementId],
    "layout element not found",
    { layoutId, elementId },
  );
};

const COMMAND_DEFINITIONS = [
  {
    type: "project.created",
    scope: "settings",
    payload: {
      requiredFields: ["state"],
      objectFields: ["state"],
    },
  },
  {
    type: "project.update",
    scope: "settings",
    payload: {
      requiredFields: ["patch"],
      objectFields: ["patch"],
    },
  },
  {
    type: "scene.create",
    scope: "story",
    payload: {
      requiredFields: ["sceneId", "name"],
      requiredStringFields: ["sceneId", "name"],
      optionalNullableStringFields: ["parentId"],
      optionalObjectFields: ["data"],
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { sceneId, parentId } = command.payload;
      assertPrecondition(!state.scenes?.[sceneId], "scene already exists", {
        sceneId,
      });
      if (parentId !== undefined && parentId !== null) {
        assertSceneFolderParent(state, sceneId, parentId);
      }
    },
  },
  {
    type: "scene.update",
    scope: "story",
    payload: {
      requiredFields: ["sceneId", "patch"],
      requiredStringFields: ["sceneId"],
      objectFields: ["patch"],
    },
    assertPreconditions: (state, command) => {
      assertSceneExists(state, command.payload.sceneId);
    },
  },
  {
    type: "scene.rename",
    scope: "story",
    payload: {
      requiredFields: ["sceneId", "name"],
      requiredStringFields: ["sceneId", "name"],
    },
    assertPreconditions: (state, command) => {
      assertSceneExists(state, command.payload.sceneId);
    },
  },
  {
    type: "scene.delete",
    scope: "story",
    payload: {
      requiredFields: ["sceneId"],
      requiredStringFields: ["sceneId"],
    },
    assertPreconditions: (state, command) => {
      assertSceneExists(state, command.payload.sceneId);
    },
  },
  {
    type: "scene.set_initial",
    scope: "story",
    payload: {
      requiredFields: ["sceneId"],
      requiredStringFields: ["sceneId"],
    },
    assertPreconditions: (state, command) => {
      const { sceneId } = command.payload;
      assertSceneExists(state, sceneId);
      assertPrecondition(
        state.scenes[sceneId].type !== "folder",
        "initial scene cannot be a folder",
        { sceneId },
      );
    },
  },
  {
    type: "scene.move",
    scope: "story",
    payload: {
      requiredFields: ["sceneId", "index"],
      requiredStringFields: ["sceneId"],
      optionalNullableStringFields: ["parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { sceneId, parentId } = command.payload;
      assertSceneExists(state, sceneId);
      if (parentId !== undefined && parentId !== null) {
        assertSceneFolderParent(state, sceneId, parentId);
      }
    },
  },
  {
    type: "section.create",
    scope: "story",
    payload: {
      requiredFields: ["sectionId", "sceneId", "name"],
      requiredStringFields: ["sectionId", "sceneId", "name"],
      optionalNullableStringFields: ["parentId"],
      optionalObjectFields: ["data"],
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { sceneId, sectionId } = command.payload;
      assertSceneExists(state, sceneId);
      assertPrecondition(
        state.scenes[sceneId].type !== "folder",
        "cannot create section inside folder scene",
        { sceneId },
      );
      assertPrecondition(
        !state.sections?.[sectionId],
        "section already exists",
        {
          sectionId,
        },
      );
    },
  },
  {
    type: "section.rename",
    scope: "story",
    payload: {
      requiredFields: ["sectionId", "name"],
      requiredStringFields: ["sectionId", "name"],
    },
    assertPreconditions: (state, command) => {
      assertSectionExists(state, command.payload.sectionId);
    },
  },
  {
    type: "section.delete",
    scope: "story",
    payload: {
      requiredFields: ["sectionId"],
      requiredStringFields: ["sectionId"],
    },
    assertPreconditions: (state, command) => {
      assertSectionExists(state, command.payload.sectionId);
    },
  },
  {
    type: "section.reorder",
    scope: "story",
    payload: {
      requiredFields: ["sectionId", "index"],
      requiredStringFields: ["sectionId"],
      optionalNullableStringFields: ["parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      assertSectionExists(state, command.payload.sectionId);
    },
  },
  {
    type: "line.insert_after",
    scope: "story",
    payload: {
      requiredFields: ["lineId", "sectionId", "line"],
      requiredStringFields: ["lineId", "sectionId"],
      objectFields: ["line"],
      optionalNullableStringFields: ["afterLineId", "parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { lineId, sectionId, afterLineId } = command.payload;
      assertSectionExists(state, sectionId);
      assertPrecondition(!state.lines?.[lineId], "line already exists", {
        lineId,
      });
      if (afterLineId !== undefined && afterLineId !== null) {
        assertLineExists(state, afterLineId, { afterLineId });
        assertPrecondition(
          state.lines[afterLineId].sectionId === sectionId,
          "afterLineId must belong to target section",
          {
            afterLineId,
            sectionId,
            actualSectionId: state.lines[afterLineId].sectionId,
          },
        );
      }
    },
  },
  {
    type: "line.update_actions",
    scope: "story",
    payload: {
      requiredFields: ["lineId", "patch"],
      requiredStringFields: ["lineId"],
      objectFields: ["patch"],
      optionalBooleanFields: ["replace"],
    },
    assertPreconditions: (state, command) => {
      assertLineExists(state, command.payload.lineId);
    },
  },
  {
    type: "line.delete",
    scope: "story",
    payload: {
      requiredFields: ["lineId"],
      requiredStringFields: ["lineId"],
    },
    assertPreconditions: (state, command) => {
      assertLineExists(state, command.payload.lineId);
    },
  },
  {
    type: "line.move",
    scope: "story",
    payload: {
      requiredFields: ["lineId", "toSectionId", "index"],
      requiredStringFields: ["lineId", "toSectionId"],
      optionalNullableStringFields: ["parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { lineId, toSectionId } = command.payload;
      assertLineExists(state, lineId);
      assertSectionExists(state, toSectionId, { toSectionId });
    },
  },
  {
    type: "resource.create",
    scope: "resources",
    payload: {
      requiredFields: ["resourceType", "resourceId", "data"],
      requiredStringFields: ["resourceType", "resourceId"],
      objectFields: ["data"],
      optionalNullableStringFields: ["parentId"],
      validateResourceType: true,
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { resourceType, resourceId } = command.payload;
      assertPrecondition(
        !state.resources?.[resourceType]?.items?.[resourceId],
        "resource already exists",
        { resourceType, resourceId },
      );
    },
  },
  {
    type: "resource.update",
    scope: "resources",
    payload: {
      requiredFields: ["resourceType", "resourceId", "patch"],
      requiredStringFields: ["resourceType", "resourceId"],
      objectFields: ["patch"],
      validateResourceType: true,
    },
    assertPreconditions: (state, command) => {
      const { resourceType, resourceId, patch } = command.payload;
      assertResourceExists(state, resourceType, resourceId);
      const currentItem = state.resources?.[resourceType]?.items?.[resourceId];
      if (resourceType === "variables" && currentItem?.type !== "folder") {
        const nextType = patch?.type;
        const nextVariableType = patch?.variableType;

        if (
          nextType !== undefined &&
          currentItem.type !== undefined &&
          nextType !== currentItem.type
        ) {
          assertPrecondition(false, "variable type cannot be changed", {
            resourceType,
            resourceId,
            currentType: currentItem.type,
            nextType,
          });
        }

        if (
          nextVariableType !== undefined &&
          currentItem.variableType !== undefined &&
          nextVariableType !== currentItem.variableType
        ) {
          assertPrecondition(false, "variable type cannot be changed", {
            resourceType,
            resourceId,
            currentVariableType: currentItem.variableType,
            nextVariableType,
          });
        }
      }
    },
  },
  {
    type: "resource.rename",
    scope: "resources",
    payload: {
      requiredFields: ["resourceType", "resourceId", "name"],
      requiredStringFields: ["resourceType", "resourceId", "name"],
      validateResourceType: true,
    },
    assertPreconditions: (state, command) => {
      const { resourceType, resourceId } = command.payload;
      assertResourceExists(state, resourceType, resourceId);
    },
  },
  {
    type: "resource.move",
    scope: "resources",
    payload: {
      requiredFields: ["resourceType", "resourceId", "index"],
      requiredStringFields: ["resourceType", "resourceId"],
      optionalNullableStringFields: ["parentId"],
      validateResourceType: true,
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { resourceType, resourceId } = command.payload;
      assertResourceExists(state, resourceType, resourceId);
    },
  },
  {
    type: "resource.delete",
    scope: "resources",
    payload: {
      requiredFields: ["resourceType", "resourceId"],
      requiredStringFields: ["resourceType", "resourceId"],
      validateResourceType: true,
    },
    assertPreconditions: (state, command) => {
      const { resourceType, resourceId } = command.payload;
      assertResourceExists(state, resourceType, resourceId);
    },
  },
  {
    type: "resource.duplicate",
    scope: "resources",
    payload: {
      requiredFields: ["resourceType", "sourceId", "newId"],
      requiredStringFields: ["resourceType", "sourceId", "newId"],
      optionalNullableStringFields: ["parentId"],
      optionalStringFields: ["name"],
      validateResourceType: true,
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { resourceType, sourceId, newId } = command.payload;
      assertResourceExists(state, resourceType, sourceId, { sourceId });
      assertPrecondition(
        !state.resources?.[resourceType]?.items?.[newId],
        "duplicate target id exists",
        { resourceType, newId },
      );
    },
  },
  {
    type: "layout.element.create",
    scope: "layouts",
    payload: {
      requiredFields: ["layoutId", "elementId", "element"],
      requiredStringFields: ["layoutId", "elementId"],
      objectFields: ["element"],
      optionalNullableStringFields: ["parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { layoutId, elementId } = command.payload;
      assertLayoutExists(state, layoutId);
      assertPrecondition(
        !state.resources.layouts.items[layoutId].elements?.[elementId],
        "layout element already exists",
        { layoutId, elementId },
      );
    },
  },
  {
    type: "layout.element.update",
    scope: "layouts",
    payload: {
      requiredFields: ["layoutId", "elementId", "patch"],
      requiredStringFields: ["layoutId", "elementId"],
      objectFields: ["patch"],
      optionalBooleanFields: ["replace"],
    },
    assertPreconditions: (state, command) => {
      const { layoutId, elementId } = command.payload;
      assertLayoutElementExists(state, layoutId, elementId);
    },
  },
  {
    type: "layout.element.move",
    scope: "layouts",
    payload: {
      requiredFields: ["layoutId", "elementId", "index"],
      requiredStringFields: ["layoutId", "elementId"],
      optionalNullableStringFields: ["parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    assertPreconditions: (state, command) => {
      const { layoutId, elementId } = command.payload;
      assertLayoutElementExists(state, layoutId, elementId);
    },
  },
  {
    type: "layout.element.delete",
    scope: "layouts",
    payload: {
      requiredFields: ["layoutId", "elementId"],
      requiredStringFields: ["layoutId", "elementId"],
    },
    assertPreconditions: (state, command) => {
      const { layoutId, elementId } = command.payload;
      assertLayoutElementExists(state, layoutId, elementId);
    },
  },
];

export const COMMAND_TYPES = Object.freeze(
  Object.fromEntries(
    COMMAND_DEFINITIONS.map((definition) => [
      definition.type.replaceAll(".", "_").toUpperCase(),
      definition.type,
    ]),
  ),
);

export const COMMAND_CATALOG = Object.freeze(
  Object.fromEntries(
    COMMAND_DEFINITIONS.map((definition) => [definition.type, definition]),
  ),
);

export const ALL_COMMAND_TYPES = Object.freeze(
  COMMAND_DEFINITIONS.map((definition) => definition.type),
);

export const COMMAND_EVENT_MODEL = Object.freeze({
  commandVersion: COMMAND_VERSION,
  requiredEnvelopeFields: Object.freeze([
    "id",
    "projectId",
    "partition",
    "type",
    "payload",
    "actor",
    "clientTs",
    "commandVersion",
  ]),
  optionalEnvelopeFields: Object.freeze(["partitions", "meta"]),
});

export const getCommandDefinition = (type) => {
  if (typeof type !== "string" || type.length === 0) {
    return undefined;
  }
  return COMMAND_CATALOG[type];
};

export const isSupportedCommandType = (type) =>
  getCommandDefinition(type) !== undefined;

export const isCommandInScope = (type, scope) =>
  getCommandDefinition(type)?.scope === scope;

export const isStoryCommandType = (type) => isCommandInScope(type, "story");

export const isLayoutCommandType = (type) => isCommandInScope(type, "layouts");

export const isResourceCommandType = (type) =>
  isCommandInScope(type, "resources");

export const isSettingsCommandType = (type) =>
  isCommandInScope(type, "settings");

export const validateCommandEnvelope = (command, errors) => {
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
  if (command.commandVersion !== COMMAND_EVENT_MODEL.commandVersion) {
    errors.push(`commandVersion must be ${COMMAND_EVENT_MODEL.commandVersion}`);
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

  if (!isSupportedCommandType(command.type)) {
    errors.push(`Unsupported command type: ${command.type}`);
  }

  if (!command.payload || typeof command.payload !== "object") {
    errors.push("payload is required");
  }
};

export const validateCommandPayload = (command, errors) => {
  const definition = getCommandDefinition(command?.type);
  if (!definition) {
    return;
  }

  const payload = command.payload;
  const spec = definition.payload || {};

  for (const field of spec.requiredFields || []) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      errors.push(`payload.${field} is required`);
    }
  }

  for (const field of spec.requiredStringFields || []) {
    if (!assertNonEmptyString(payload?.[field])) {
      errors.push(`payload.${field} must be a non-empty string`);
    }
  }

  for (const field of spec.optionalStringFields || []) {
    validateOptionalStringField(payload, field, errors);
  }

  for (const field of spec.optionalNullableStringFields || []) {
    validateOptionalNullableStringField(payload, field, errors);
  }

  for (const field of spec.objectFields || []) {
    validatePlainObjectField(payload, field, errors);
  }

  for (const field of spec.optionalObjectFields || []) {
    validateOptionalPlainObjectField(payload, field, errors);
  }

  for (const field of spec.optionalBooleanFields || []) {
    validateOptionalBooleanField(payload, field, errors);
  }

  if (spec.validateResourceType) {
    const resourceType = payload?.resourceType;
    if (resourceType && !RESOURCE_TYPES.includes(resourceType)) {
      errors.push(`Unsupported resourceType: ${resourceType}`);
    }
  }

  if (spec.allowIndex && payload.index !== undefined) {
    if (!Number.isInteger(payload.index)) {
      errors.push("payload.index must be integer when provided");
    }
  }

  if (spec.allowPosition) {
    validatePositionField(payload, errors);
  }
};

export const assertCommandPreconditions = (state, command) => {
  if (state?.project?.id) {
    assertPrecondition(
      state.project.id === command.projectId,
      "projectId mismatch",
      {
        expected: state.project.id,
        got: command.projectId,
      },
    );
  }

  const definition = getCommandDefinition(command?.type);
  definition?.assertPreconditions?.(state, command);
};

export const validateCommand = (command) => {
  const errors = [];

  validateCommandEnvelope(command, errors);
  if (!command || !command.payload || typeof command.payload !== "object") {
    throw new DomainValidationError("Invalid command envelope", { errors });
  }

  validateCommandPayload(command, errors);

  if (errors.length > 0) {
    throw new DomainValidationError("Command validation failed", { errors });
  }

  return true;
};

export const commandToEvent = (command) => ({
  type: command.type,
  payload: structuredClone(command.payload),
  meta: {
    ts: command.clientTs,
  },
});
