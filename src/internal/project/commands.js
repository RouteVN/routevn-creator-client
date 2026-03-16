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
  const positionTargetId = payload?.positionTargetId;

  if (position === undefined || position === null) {
    if (positionTargetId !== undefined && positionTargetId !== null) {
      errors.push("payload.positionTargetId requires payload.position");
    }
    return;
  }

  if (position === "first" || position === "last") {
    if (positionTargetId !== undefined && positionTargetId !== null) {
      errors.push(
        "payload.positionTargetId is allowed only when payload.position is 'before' or 'after'",
      );
    }
    return;
  }

  if (position === "before" || position === "after") {
    if (!assertNonEmptyString(positionTargetId)) {
      errors.push(
        "payload.positionTargetId must be a non-empty string when payload.position is 'before' or 'after'",
      );
    }
    return;
  }

  if (!isPlainObject(position)) {
    errors.push(
      "payload.position must be 'first', 'last', 'before', 'after', or a legacy object with before/after",
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

const validateRequiredStringArrayField = (payload, field, errors) => {
  const value = payload?.[field];
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`payload.${field} must be a non-empty array`);
    return;
  }

  const seen = new Set();
  value.forEach((entry, index) => {
    if (!assertNonEmptyString(entry)) {
      errors.push(`payload.${field}[${index}] must be a non-empty string`);
      return;
    }

    if (seen.has(entry)) {
      errors.push(`payload.${field}[${index}] must be unique`);
      return;
    }

    seen.add(entry);
  });
};

const hasOwn = (value, field) =>
  Object.prototype.hasOwnProperty.call(value || {}, field);

const validateRequiredNestedStringField = (payload, path, errors) => {
  let current = payload;
  for (const segment of path) {
    current = current?.[segment];
  }

  if (!assertNonEmptyString(current)) {
    errors.push(`payload.${path.join(".")} must be a non-empty string`);
  }
};

const normalizePayloadDataField = (
  payload,
  { legacyFields = [], rootFields = [] } = {},
) => {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const nextPayload = structuredClone(payload);
  let data = nextPayload.data;

  if (data === undefined) {
    for (const field of legacyFields) {
      if (hasOwn(nextPayload, field)) {
        data = structuredClone(nextPayload[field]);
        break;
      }
    }
  }

  if (
    data === undefined &&
    rootFields.some((field) => hasOwn(nextPayload, field))
  ) {
    data = {};
  }

  if (isPlainObject(data)) {
    for (const field of rootFields) {
      if (!hasOwn(data, field) && hasOwn(nextPayload, field)) {
        data[field] = structuredClone(nextPayload[field]);
      }
    }
  }

  if (data !== undefined) {
    nextPayload.data = data;
  }

  for (const field of legacyFields) {
    delete nextPayload[field];
  }

  for (const field of rootFields) {
    delete nextPayload[field];
  }

  return nextPayload;
};

const normalizeRootPositionFields = (payload) => {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const nextPayload = structuredClone(payload);
  const position = nextPayload.position;

  if (isPlainObject(position) && nextPayload.positionTargetId === undefined) {
    if (assertNonEmptyString(position.before)) {
      nextPayload.position = "before";
      nextPayload.positionTargetId = position.before;
    } else if (assertNonEmptyString(position.after)) {
      nextPayload.position = "after";
      nextPayload.positionTargetId = position.after;
    }
  }

  return nextPayload;
};

const normalizeLineCreateItem = (item) => {
  if (!isPlainObject(item)) {
    return item;
  }

  return normalizePayloadDataField(item, {
    legacyFields: ["line"],
  });
};

const normalizeLineCreatePayload = (payload) => {
  if (!isPlainObject(payload)) {
    return payload;
  }

  const nextPayload = structuredClone(payload);
  let lines = Array.isArray(nextPayload.lines)
    ? nextPayload.lines.map((item) => normalizeLineCreateItem(item))
    : undefined;

  if (lines === undefined && hasOwn(nextPayload, "lineId")) {
    lines = [
      normalizeLineCreateItem({
        lineId: nextPayload.lineId,
        data: nextPayload.data,
        line: nextPayload.line,
      }),
    ];
  }

  if (lines !== undefined) {
    nextPayload.lines = lines;
  }

  if (nextPayload.position === undefined) {
    if (assertNonEmptyString(nextPayload.beforeLineId)) {
      nextPayload.position = "before";
      nextPayload.positionTargetId = nextPayload.beforeLineId;
    } else if (assertNonEmptyString(nextPayload.afterLineId)) {
      nextPayload.position = "after";
      nextPayload.positionTargetId = nextPayload.afterLineId;
    }
  }

  delete nextPayload.lineId;
  delete nextPayload.data;
  delete nextPayload.line;
  delete nextPayload.beforeLineId;
  delete nextPayload.afterLineId;

  return nextPayload;
};

const validateLineCreatePayload = (payload, errors) => {
  if (!Array.isArray(payload?.lines) || payload.lines.length === 0) {
    errors.push("payload.lines must be a non-empty array");
    return;
  }

  const seenLineIds = new Set();

  payload.lines.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`payload.lines[${index}] must be an object`);
      return;
    }

    if (!assertNonEmptyString(item.lineId)) {
      errors.push(`payload.lines[${index}].lineId must be a non-empty string`);
    }

    if (!isPlainObject(item.data)) {
      errors.push(`payload.lines[${index}].data must be an object`);
    }

    if (assertNonEmptyString(item.lineId)) {
      if (seenLineIds.has(item.lineId)) {
        errors.push(`payload.lines[${index}].lineId must be unique`);
      }
      seenLineIds.add(item.lineId);
    }
  });
};

const normalizeCommandType = (type) => {
  if (type === "line.insert_after") {
    return "line.create";
  }

  if (type === "section.reorder") {
    return "section.move";
  }

  if (type === "section.rename") {
    return "section.update";
  }

  if (type === "resource.rename") {
    return "resource.update";
  }

  return type;
};

const normalizeCommandPayload = (type, payload) => {
  if (!isPlainObject(payload)) {
    return payload;
  }

  if (type === "scene.create") {
    return normalizeRootPositionFields(
      normalizePayloadDataField(payload, {
        rootFields: ["name"],
      }),
    );
  }

  if (type === "scene.update") {
    return normalizePayloadDataField(payload, {
      legacyFields: ["patch"],
    });
  }

  if (type === "section.create") {
    return normalizeRootPositionFields(
      normalizePayloadDataField(payload, {
        rootFields: ["name"],
      }),
    );
  }

  if (type === "section.update") {
    return normalizePayloadDataField(payload, {
      legacyFields: ["patch"],
      rootFields: ["name"],
    });
  }

  if (type === "line.create") {
    return normalizeRootPositionFields(normalizeLineCreatePayload(payload));
  }

  if (type === "line.update_actions") {
    return normalizePayloadDataField(payload, {
      legacyFields: ["patch"],
    });
  }

  if (type === "resource.update") {
    return normalizePayloadDataField(payload, {
      legacyFields: ["patch"],
      rootFields: ["name"],
    });
  }

  if (type === "layout.element.create") {
    return normalizeRootPositionFields(
      normalizePayloadDataField(payload, {
        legacyFields: ["element"],
      }),
    );
  }

  if (type === "layout.element.update") {
    return normalizePayloadDataField(payload, {
      legacyFields: ["patch"],
    });
  }

  return normalizeRootPositionFields(structuredClone(payload));
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
    type: "project.create",
    scope: "settings",
    payload: {
      requiredFields: ["state"],
      objectFields: ["state"],
    },
  },
  {
    type: "scene.create",
    scope: "story",
    payload: {
      requiredFields: ["sceneId", "data"],
      requiredStringFields: ["sceneId"],
      objectFields: ["data"],
      optionalNullableStringFields: ["parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    validatePayload: (payload, errors) => {
      validateRequiredNestedStringField(payload, ["data", "name"], errors);
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
      requiredFields: ["sceneId", "data"],
      requiredStringFields: ["sceneId"],
      objectFields: ["data"],
    },
    assertPreconditions: (state, command) => {
      assertSceneExists(state, command.payload.sceneId);
    },
  },
  {
    type: "scene.delete",
    scope: "story",
    payload: {
      requiredFields: ["sceneIds"],
      requiredStringArrayFields: ["sceneIds"],
    },
    assertPreconditions: (state, command) => {
      for (const sceneId of command.payload.sceneIds || []) {
        assertSceneExists(state, sceneId);
      }
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
      requiredFields: ["sectionId", "sceneId", "data"],
      requiredStringFields: ["sectionId", "sceneId"],
      objectFields: ["data"],
      optionalNullableStringFields: ["parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    validatePayload: (payload, errors) => {
      validateRequiredNestedStringField(payload, ["data", "name"], errors);
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
    type: "section.update",
    scope: "story",
    payload: {
      requiredFields: ["sectionId", "data"],
      requiredStringFields: ["sectionId"],
      objectFields: ["data"],
    },
    assertPreconditions: (state, command) => {
      assertSectionExists(state, command.payload.sectionId);
    },
  },
  {
    type: "section.delete",
    scope: "story",
    payload: {
      requiredFields: ["sectionIds"],
      requiredStringArrayFields: ["sectionIds"],
    },
    assertPreconditions: (state, command) => {
      for (const sectionId of command.payload.sectionIds || []) {
        assertSectionExists(state, sectionId);
      }
    },
  },
  {
    type: "section.move",
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
    type: "line.create",
    scope: "story",
    payload: {
      requiredFields: ["sectionId", "lines"],
      requiredStringFields: ["sectionId"],
      optionalNullableStringFields: ["parentId"],
      allowIndex: true,
      allowPosition: true,
    },
    validatePayload: (payload, errors) => {
      validateLineCreatePayload(payload, errors);
    },
    assertPreconditions: (state, command) => {
      const { sectionId, position, positionTargetId } = command.payload;
      assertSectionExists(state, sectionId);

      for (const item of command.payload.lines || []) {
        assertPrecondition(!state.lines?.[item.lineId], "line already exists", {
          lineId: item.lineId,
        });
      }

      let positionLineId;
      if (
        (position === "before" || position === "after") &&
        assertNonEmptyString(positionTargetId)
      ) {
        positionLineId = positionTargetId;
      } else if (
        isPlainObject(position) &&
        assertNonEmptyString(position.before)
      ) {
        positionLineId = position.before;
      } else if (
        isPlainObject(position) &&
        assertNonEmptyString(position.after)
      ) {
        positionLineId = position.after;
      }

      if (positionLineId !== undefined) {
        assertLineExists(state, positionLineId, { positionLineId });
        assertPrecondition(
          state.lines[positionLineId].sectionId === sectionId,
          "position target must belong to target section",
          {
            positionLineId,
            sectionId,
            actualSectionId: state.lines[positionLineId].sectionId,
          },
        );
      }
    },
  },
  {
    type: "line.update_actions",
    scope: "story",
    payload: {
      requiredFields: ["lineId", "data"],
      requiredStringFields: ["lineId"],
      objectFields: ["data"],
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
      requiredFields: ["lineIds"],
      requiredStringArrayFields: ["lineIds"],
    },
    assertPreconditions: (state, command) => {
      for (const lineId of command.payload.lineIds || []) {
        assertLineExists(state, lineId);
      }
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
      requiredFields: ["resourceType", "resourceId", "data"],
      requiredStringFields: ["resourceType", "resourceId"],
      objectFields: ["data"],
      validateResourceType: true,
    },
    assertPreconditions: (state, command) => {
      const { resourceType, resourceId, data } = command.payload;
      assertResourceExists(state, resourceType, resourceId);
      const currentItem = state.resources?.[resourceType]?.items?.[resourceId];
      if (resourceType === "variables" && currentItem?.type !== "folder") {
        const nextType = data?.type;
        const nextVariableType = data?.variableType;

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
      requiredFields: ["resourceType", "resourceIds"],
      requiredStringFields: ["resourceType"],
      requiredStringArrayFields: ["resourceIds"],
      validateResourceType: true,
    },
    assertPreconditions: (state, command) => {
      const { resourceType, resourceIds } = command.payload;
      for (const resourceId of resourceIds || []) {
        assertResourceExists(state, resourceType, resourceId);
      }
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
      requiredFields: ["layoutId", "elementId", "data"],
      requiredStringFields: ["layoutId", "elementId"],
      objectFields: ["data"],
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
      requiredFields: ["layoutId", "elementId", "data"],
      requiredStringFields: ["layoutId", "elementId"],
      objectFields: ["data"],
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
      requiredFields: ["layoutId", "elementIds"],
      requiredStringFields: ["layoutId"],
      requiredStringArrayFields: ["elementIds"],
    },
    assertPreconditions: (state, command) => {
      const { layoutId, elementIds } = command.payload;
      for (const elementId of elementIds || []) {
        assertLayoutElementExists(state, layoutId, elementId);
      }
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
    "partitions",
    "type",
    "payload",
    "actor",
    "clientTs",
    "commandVersion",
  ]),
  optionalEnvelopeFields: Object.freeze(["meta"]),
});

export const getCommandDefinition = (type) => {
  if (typeof type !== "string" || type.length === 0) {
    return undefined;
  }
  return COMMAND_CATALOG[type];
};

export const normalizeCommand = (command) => {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    return command;
  }

  const normalizedCommand = structuredClone(command);
  normalizedCommand.type = normalizeCommandType(normalizedCommand.type);
  normalizedCommand.payload = normalizeCommandPayload(
    normalizedCommand.type,
    normalizedCommand.payload,
  );
  return normalizedCommand;
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
  if (!Array.isArray(command.partitions) || command.partitions.length === 0) {
    errors.push("partitions must be a non-empty array");
  } else {
    for (const partition of command.partitions) {
      if (!assertNonEmptyString(partition)) {
        errors.push("partitions entries must be non-empty strings");
        break;
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
  const normalizedCommand = normalizeCommand(command);
  const definition = getCommandDefinition(normalizedCommand?.type);
  if (!definition) {
    return;
  }

  const payload = normalizedCommand.payload;
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

  for (const field of spec.requiredStringArrayFields || []) {
    validateRequiredStringArrayField(payload, field, errors);
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

  definition.validatePayload?.(payload, errors);
};

export const assertCommandPreconditions = (state, command) => {
  const normalizedCommand = normalizeCommand(command);
  if (state?.project?.id) {
    assertPrecondition(
      state.project.id === normalizedCommand.projectId,
      "projectId mismatch",
      {
        expected: state.project.id,
        got: normalizedCommand.projectId,
      },
    );
  }

  const definition = getCommandDefinition(normalizedCommand?.type);
  definition?.assertPreconditions?.(state, normalizedCommand);
};

export const validateCommand = (command) => {
  const normalizedCommand = normalizeCommand(command);
  const errors = [];

  validateCommandEnvelope(normalizedCommand, errors);
  if (
    !normalizedCommand ||
    !normalizedCommand.payload ||
    typeof normalizedCommand.payload !== "object"
  ) {
    throw new DomainValidationError("Invalid command envelope", { errors });
  }

  validateCommandPayload(normalizedCommand, errors);

  if (errors.length > 0) {
    throw new DomainValidationError(
      `Command validation failed: ${errors.join("; ")}`,
      { errors },
    );
  }

  return true;
};

export const commandToEvent = (command) => {
  const normalizedCommand = normalizeCommand(command);
  return {
    type: normalizedCommand.type,
    payload: structuredClone(normalizedCommand.payload),
    meta: {
      ts: normalizedCommand.clientTs,
    },
  };
};
