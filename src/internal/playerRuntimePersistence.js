const SAVE_FORMAT_VERSION = 1;
const SAVE_SLOT_KEY_PREFIX = "saveSlots:";

export const GLOBAL_DEVICE_VARIABLES_KEY = "globalDeviceVariables";
export const GLOBAL_ACCOUNT_VARIABLES_KEY = "globalAccountVariables";
export const GLOBAL_RUNTIME_KEY = "globalRuntime";
export const ACCOUNT_VIEWED_REGISTRY_KEY = "accountViewedRegistry";

const FIXED_PERSISTENCE_KEYS = new Set([
  GLOBAL_DEVICE_VARIABLES_KEY,
  GLOBAL_ACCOUNT_VARIABLES_KEY,
  GLOBAL_RUNTIME_KEY,
  ACCOUNT_VIEWED_REGISTRY_KEY,
]);

const STATE_FIELD_BY_KEY = Object.freeze({
  [GLOBAL_DEVICE_VARIABLES_KEY]: "globalDeviceVariables",
  [GLOBAL_ACCOUNT_VARIABLES_KEY]: "globalAccountVariables",
  [GLOBAL_RUNTIME_KEY]: "globalRuntime",
  [ACCOUNT_VIEWED_REGISTRY_KEY]: "accountViewedRegistry",
});

const isPlainObject = (value) => {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const requirePlainObject = (value, label) => {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return value;
};

const requireArray = (value, label) => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array`);
  }

  return value;
};

const requireField = (value, field, label) => {
  if (!Object.hasOwn(value, field)) {
    throw new Error(`${label}.${field} is required`);
  }

  return value[field];
};

const setOwnJsonProperty = (target, key, value) => {
  Object.defineProperty(target, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
};

const rejectUnknownFields = (value, allowedFields, label) => {
  const allowed = new Set(allowedFields);
  const field = Object.keys(value).find((key) => !allowed.has(key));
  if (field !== undefined) {
    throw new Error(`${label}.${field} is not supported`);
  }
};

const requireNonEmptyString = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty JSON string`);
  }
};

const requireString = (value, label) => {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a JSON string`);
  }
};

const requireBoolean = (value, label) => {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a JSON boolean`);
  }
};

const requireNumber = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite JSON number`);
  }

  return value;
};

const requireSafeInteger = (value, label) => {
  requireNumber(value, label);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a JavaScript-safe JSON integer`);
  }

  return value;
};

const assertJsonValue = (value, label, ancestors = new WeakSet()) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    requireNumber(value, label);
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${label} must contain only JSON values`);
  }
  if (ancestors.has(value)) {
    throw new Error(`${label} must not contain cyclic data`);
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    throw new Error(`${label} must contain only JSON objects and arrays`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error(`${label} must contain only JSON string-keyed properties`);
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    const keys = Object.keys(value);
    if (
      keys.length !== value.length ||
      keys.some((key, index) => key !== String(index)) ||
      Object.getOwnPropertyNames(value).length !== value.length + 1
    ) {
      throw new Error(
        `${label} must not contain sparse or named array entries`,
      );
    }
    keys.forEach((key, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, "value")) {
        throw new Error(`${label}[${index}] must be a JSON data property`);
      }
      assertJsonValue(descriptor.value, `${label}[${index}]`, ancestors);
    });
  } else {
    const propertyNames = Object.getOwnPropertyNames(value);
    if (propertyNames.length !== Object.keys(value).length) {
      throw new Error(`${label} must contain only enumerable JSON properties`);
    }
    propertyNames.forEach((field) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!Object.hasOwn(descriptor, "value")) {
        throw new Error(`${label}.${field} must be a JSON data property`);
      }
      assertJsonValue(descriptor.value, `${label}.${field}`, ancestors);
    });
  }
  ancestors.delete(value);
};

export const cloneJsonValue = (value, label = "Persistence value") => {
  assertJsonValue(value, label);
  return JSON.parse(JSON.stringify(value));
};

export const createEmptyPlayerPersistenceState = () => ({
  saveSlots: {},
  globalDeviceVariables: {},
  globalAccountVariables: {},
  globalRuntime: {},
  accountViewedRegistry: {},
});

const validateVariableValue = (value, label) => {
  if (value === null) {
    throw new Error(
      `${label} must be a JSON string, number, boolean, object, or array`,
    );
  }
};

const validateVariableMap = (value, label) => {
  const variables = requirePlainObject(value, label);
  Object.entries(variables).forEach(([variableId, variableValue]) => {
    if (variableId.length === 0) {
      throw new Error(`${label} contains an empty variable ID`);
    }
    validateVariableValue(variableValue, `${label}.${variableId}`);
  });
};

const validateGlobalRuntime = (value, label) => {
  const runtime = requirePlainObject(value, label);
  rejectUnknownFields(
    runtime,
    [
      "dialogueTextSpeed",
      "autoForwardDelay",
      "skipUnseenText",
      "skipTransitionsAndAnimations",
      "soundVolume",
      "musicVolume",
      "muteAll",
    ],
    label,
  );

  [
    "dialogueTextSpeed",
    "autoForwardDelay",
    "soundVolume",
    "musicVolume",
  ].forEach((field) => {
    if (!Object.hasOwn(runtime, field)) {
      return;
    }
    const number = requireNumber(runtime[field], `${label}.${field}`);
    if (
      ["soundVolume", "musicVolume"].includes(field) &&
      (number < 0 || number > 100)
    ) {
      throw new Error(`${label}.${field} must be between 0 and 100`);
    }
  });

  ["skipUnseenText", "skipTransitionsAndAnimations", "muteAll"].forEach(
    (field) => {
      if (Object.hasOwn(runtime, field)) {
        requireBoolean(runtime[field], `${label}.${field}`);
      }
    },
  );
};

const validateViewedRegistryId = (value, label) => {
  if (typeof value === "string" && value.length > 0) {
    return;
  }
  if (typeof value === "number") {
    requireSafeInteger(value, label);
    return;
  }

  throw new Error(
    `${label} must be a non-empty JSON string or JavaScript-safe integer`,
  );
};

const validateStoredViewedSections = (value, label) => {
  requireArray(value, label).forEach((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    if (typeof entry === "string" || typeof entry === "number") {
      validateViewedRegistryId(entry, entryLabel);
      return;
    }

    const section = requirePlainObject(entry, entryLabel);
    rejectUnknownFields(section, ["sectionId", "lastLineId"], entryLabel);
    requireNonEmptyString(
      requireField(section, "sectionId", entryLabel),
      `${entryLabel}.sectionId`,
    );
    if (Object.hasOwn(section, "lastLineId") && section.lastLineId !== null) {
      requireString(section.lastLineId, `${entryLabel}.lastLineId`);
    }
  });
};

const validateStoredViewedResources = (value, label) => {
  requireArray(value, label).forEach((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    if (typeof entry === "string" || typeof entry === "number") {
      validateViewedRegistryId(entry, entryLabel);
      return;
    }

    const resource = requirePlainObject(entry, entryLabel);
    rejectUnknownFields(resource, ["resourceId"], entryLabel);
    requireNonEmptyString(
      requireField(resource, "resourceId", entryLabel),
      `${entryLabel}.resourceId`,
    );
  });
};

const validateAccountViewedRegistry = (value, label) => {
  const registry = requirePlainObject(value, label);
  rejectUnknownFields(registry, ["sections", "resources"], label);
  if (Object.hasOwn(registry, "sections")) {
    validateStoredViewedSections(registry.sections, `${label}.sections`);
  }
  if (Object.hasOwn(registry, "resources")) {
    validateStoredViewedResources(registry.resources, `${label}.resources`);
  }
};

const validateViewedRegistryPatch = (value, label) => {
  const patch = requirePlainObject(value, label);
  rejectUnknownFields(patch, ["sections", "resources"], label);
  if (!Object.hasOwn(patch, "sections") && !Object.hasOwn(patch, "resources")) {
    throw new Error(`${label} must contain sections, resources, or both`);
  }

  if (Object.hasOwn(patch, "sections")) {
    requireArray(patch.sections, `${label}.sections`).forEach(
      (entry, index) => {
        const entryLabel = `${label}.sections[${index}]`;
        const section = requirePlainObject(entry, entryLabel);
        rejectUnknownFields(section, ["sectionId", "lineId"], entryLabel);
        requireNonEmptyString(
          requireField(section, "sectionId", entryLabel),
          `${entryLabel}.sectionId`,
        );
        if (Object.hasOwn(section, "lineId")) {
          requireNonEmptyString(section.lineId, `${entryLabel}.lineId`);
        }
      },
    );
  }

  if (Object.hasOwn(patch, "resources")) {
    requireArray(patch.resources, `${label}.resources`).forEach(
      (entry, index) => {
        const entryLabel = `${label}.resources[${index}]`;
        const resource = requirePlainObject(entry, entryLabel);
        rejectUnknownFields(resource, ["resourceId"], entryLabel);
        requireNonEmptyString(
          requireField(resource, "resourceId", entryLabel),
          `${entryLabel}.resourceId`,
        );
      },
    );
  }
};

const validateReadPointer = (value, label) => {
  const pointer = requirePlainObject(value, label);
  rejectUnknownFields(pointer, ["sceneId", "sectionId", "lineId"], label);
  if (Object.hasOwn(pointer, "sceneId")) {
    requireString(pointer.sceneId, `${label}.sceneId`);
  }
  requireNonEmptyString(
    requireField(pointer, "sectionId", label),
    `${label}.sectionId`,
  );
  requireNonEmptyString(
    requireField(pointer, "lineId", label),
    `${label}.lineId`,
  );
};

const validateContextRuntime = (value, label) => {
  const runtime = requirePlainObject(value, label);
  rejectUnknownFields(
    runtime,
    ["saveLoadPagination", "menuPage", "menuEntryPoint"],
    label,
  );

  const pagination = requireSafeInteger(
    requireField(runtime, "saveLoadPagination", label),
    `${label}.saveLoadPagination`,
  );
  if (pagination < 1) {
    throw new Error(`${label}.saveLoadPagination must be at least 1`);
  }
  requireString(requireField(runtime, "menuPage", label), `${label}.menuPage`);
  requireString(
    requireField(runtime, "menuEntryPoint", label),
    `${label}.menuEntryPoint`,
  );
};

const validateRollbackCheckpoint = (value, label) => {
  const checkpoint = requirePlainObject(value, label);
  rejectUnknownFields(
    checkpoint,
    ["sectionId", "lineId", "rollbackPolicy", "executedActions"],
    label,
  );
  requireNonEmptyString(
    requireField(checkpoint, "sectionId", label),
    `${label}.sectionId`,
  );
  requireNonEmptyString(
    requireField(checkpoint, "lineId", label),
    `${label}.lineId`,
  );
  if (Object.hasOwn(checkpoint, "rollbackPolicy")) {
    requireString(checkpoint.rollbackPolicy, `${label}.rollbackPolicy`);
  }
  if (Object.hasOwn(checkpoint, "executedActions")) {
    requireArray(
      checkpoint.executedActions,
      `${label}.executedActions`,
    ).forEach((entry, index) => {
      const entryLabel = `${label}.executedActions[${index}]`;
      const action = requirePlainObject(entry, entryLabel);
      rejectUnknownFields(action, ["type", "payload"], entryLabel);
      requireNonEmptyString(
        requireField(action, "type", entryLabel),
        `${entryLabel}.type`,
      );
    });
  }
};

const validateRollback = (value, readPointer, label) => {
  const rollback = requirePlainObject(value, label);
  rejectUnknownFields(
    rollback,
    ["timeline", "currentIndex", "isRestoring", "replayStartIndex"],
    label,
  );
  const timeline = requireArray(
    requireField(rollback, "timeline", label),
    `${label}.timeline`,
  );
  if (timeline.length === 0) {
    throw new Error(`${label}.timeline must not be empty`);
  }
  timeline.forEach((checkpoint, index) =>
    validateRollbackCheckpoint(checkpoint, `${label}.timeline[${index}]`),
  );

  const currentIndex = requireSafeInteger(
    requireField(rollback, "currentIndex", label),
    `${label}.currentIndex`,
  );
  if (currentIndex < 0 || currentIndex >= timeline.length) {
    throw new Error(
      `${label}.currentIndex must identify an entry in ${label}.timeline`,
    );
  }
  requireBoolean(
    requireField(rollback, "isRestoring", label),
    `${label}.isRestoring`,
  );
  const replayStartIndex = requireSafeInteger(
    requireField(rollback, "replayStartIndex", label),
    `${label}.replayStartIndex`,
  );
  if (replayStartIndex < 0) {
    throw new Error(`${label}.replayStartIndex must not be negative`);
  }

  const currentCheckpoint = timeline[currentIndex];
  if (
    currentCheckpoint.sectionId !== readPointer.sectionId ||
    currentCheckpoint.lineId !== readPointer.lineId
  ) {
    throw new Error(
      `${label}.timeline[currentIndex] must match the context read pointer`,
    );
  }
};

const validateSaveContext = (value, label) => {
  const context = requirePlainObject(value, label);
  rejectUnknownFields(
    context,
    [
      "currentPointerMode",
      "pointers",
      "configuration",
      "views",
      "bgm",
      "variables",
      "runtime",
      "rollback",
    ],
    label,
  );
  if (requireField(context, "currentPointerMode", label) !== "read") {
    throw new Error(`${label}.currentPointerMode must be "read"`);
  }

  const pointersLabel = `${label}.pointers`;
  const pointers = requirePlainObject(
    requireField(context, "pointers", label),
    pointersLabel,
  );
  rejectUnknownFields(pointers, ["read"], pointersLabel);
  const readPointerLabel = `${pointersLabel}.read`;
  const readPointer = requireField(pointers, "read", pointersLabel);
  validateReadPointer(readPointer, readPointerLabel);

  requirePlainObject(
    requireField(context, "configuration", label),
    `${label}.configuration`,
  );
  requireArray(requireField(context, "views", label), `${label}.views`).forEach(
    (view, index) => requirePlainObject(view, `${label}.views[${index}]`),
  );

  const bgmLabel = `${label}.bgm`;
  const bgm = requirePlainObject(requireField(context, "bgm", label), bgmLabel);
  if (Object.hasOwn(bgm, "resourceId")) {
    requireString(bgm.resourceId, `${bgmLabel}.resourceId`);
  }

  validateVariableMap(
    requireField(context, "variables", label),
    `${label}.variables`,
  );
  if (Object.hasOwn(context, "runtime")) {
    validateContextRuntime(context.runtime, `${label}.runtime`);
  }
  validateRollback(
    requireField(context, "rollback", label),
    readPointer,
    `${label}.rollback`,
  );
};

const saveSlotIdStorageKey = (value, label) => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number") {
    return String(requireSafeInteger(value, label));
  }

  throw new Error(
    `${label} must be a non-empty JSON string or JavaScript-safe integer`,
  );
};

const validateSaveSlot = (slotKey, value, label) => {
  const saveSlot = requirePlainObject(value, label);
  const formatVersion = requireSafeInteger(
    requireField(saveSlot, "formatVersion", label),
    `${label}.formatVersion`,
  );
  if (formatVersion !== SAVE_FORMAT_VERSION) {
    throw new Error(`${label}.formatVersion must be ${SAVE_FORMAT_VERSION}`);
  }

  const storedSlotKey = saveSlotIdStorageKey(
    requireField(saveSlot, "slotId", label),
    `${label}.slotId`,
  );
  if (storedSlotKey !== slotKey) {
    throw new Error(
      `${label}.slotId must match persistence key ${SAVE_SLOT_KEY_PREFIX}${slotKey}`,
    );
  }

  const savedAt = requireSafeInteger(
    requireField(saveSlot, "savedAt", label),
    `${label}.savedAt`,
  );
  if (savedAt < 0) {
    throw new Error(`${label}.savedAt must not be negative`);
  }
  if (Object.hasOwn(saveSlot, "image") && saveSlot.image !== null) {
    requireString(saveSlot.image, `${label}.image`);
  }

  const stateLabel = `${label}.state`;
  const state = requirePlainObject(
    requireField(saveSlot, "state", label),
    stateLabel,
  );
  rejectUnknownFields(state, ["contexts"], stateLabel);
  const contexts = requireArray(
    requireField(state, "contexts", stateLabel),
    `${stateLabel}.contexts`,
  );
  if (contexts.length === 0) {
    throw new Error(`${stateLabel}.contexts must not be empty`);
  }
  contexts.forEach((context, index) =>
    validateSaveContext(context, `${stateLabel}.contexts[${index}]`),
  );
};

const persistenceSaveSlotKey = (key) => {
  if (!key.startsWith(SAVE_SLOT_KEY_PREFIX)) {
    return undefined;
  }
  const slotKey = key.slice(SAVE_SLOT_KEY_PREFIX.length);
  return slotKey.length > 0 ? slotKey : undefined;
};

export const saveSlotPersistenceKey = (slotKey) => {
  if (typeof slotKey !== "string" || slotKey.length === 0) {
    throw new Error("Runtime save slot key must not be empty");
  }
  return `${SAVE_SLOT_KEY_PREFIX}${slotKey}`;
};

export const validatePlayerPersistenceValue = (key, value) => {
  const slotKey = persistenceSaveSlotKey(key);
  if (!FIXED_PERSISTENCE_KEYS.has(key) && slotKey === undefined) {
    throw new Error(`Unsupported runtime persistence key: ${key}`);
  }

  const label = `Runtime persistence key ${key}`;
  if (slotKey !== undefined) {
    validateSaveSlot(slotKey, value, label);
    return;
  }

  if (
    key === GLOBAL_DEVICE_VARIABLES_KEY ||
    key === GLOBAL_ACCOUNT_VARIABLES_KEY
  ) {
    validateVariableMap(value, label);
    return;
  }
  if (key === GLOBAL_RUNTIME_KEY) {
    validateGlobalRuntime(value, label);
    return;
  }
  validateAccountViewedRegistry(value, label);
};

export const snapshotPlayerPersistenceValue = (key, value) => {
  const label = `Player persistence ${key}`;
  const snapshot = cloneJsonValue(value, label);
  requirePlainObject(snapshot, label);
  validatePlayerPersistenceValue(key, snapshot);
  return snapshot;
};

export const snapshotSaveSlots = (value) => {
  const label = "Player persistence saveSlots";
  const snapshot = cloneJsonValue(value, label);
  const saveSlots = requirePlainObject(snapshot, label);
  Object.entries(saveSlots).forEach(([slotKey, saveSlot]) => {
    const key = saveSlotPersistenceKey(slotKey);
    validatePlayerPersistenceValue(key, saveSlot);
  });
  return snapshot;
};

export const persistenceRowsToState = (rows) => {
  if (!Array.isArray(rows)) {
    throw new Error("Player persistence rows must be an array");
  }

  const state = createEmptyPlayerPersistenceState();
  rows.forEach((row, index) => {
    const entry = requirePlainObject(row, `Player persistence rows[${index}]`);
    requireNonEmptyString(entry.key, `Player persistence rows[${index}].key`);
    const value = cloneJsonValue(
      entry.value,
      `Runtime persistence key ${entry.key}`,
    );
    validatePlayerPersistenceValue(entry.key, value);

    const slotKey = persistenceSaveSlotKey(entry.key);
    if (slotKey !== undefined) {
      setOwnJsonProperty(state.saveSlots, slotKey, value);
      return;
    }
    state[STATE_FIELD_BY_KEY[entry.key]] = value;
  });

  return state;
};

const jsonValuesEqual = (left, right) => {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => jsonValuesEqual(entry, right[index]))
    );
  }
  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) && jsonValuesEqual(left[key], right[key]),
    )
  );
};

export const createSaveSlotsBatch = (previousSaveSlots, nextSaveSlots) => {
  const previous = requirePlainObject(previousSaveSlots, "Previous save slots");
  const next = requirePlainObject(nextSaveSlots, "Next save slots");
  const puts = [];
  const deletes = [];

  Object.entries(next).forEach(([slotKey, value]) => {
    if (!jsonValuesEqual(previous[slotKey], value)) {
      puts.push({ key: saveSlotPersistenceKey(slotKey), value });
    }
  });
  Object.keys(previous).forEach((slotKey) => {
    if (!Object.hasOwn(next, slotKey)) {
      deletes.push(saveSlotPersistenceKey(slotKey));
    }
  });

  return { puts, deletes };
};

const normalizeStoredSections = (registry) =>
  (Array.isArray(registry?.sections) ? registry.sections : []).map((entry) => {
    if (typeof entry === "string" || typeof entry === "number") {
      return { sectionId: String(entry) };
    }
    const section = { sectionId: entry.sectionId };
    if (typeof entry.lastLineId === "string") {
      section.lastLineId = entry.lastLineId;
    }
    return section;
  });

const normalizePatchSections = (patch) =>
  (Array.isArray(patch?.sections) ? patch.sections : []).map((entry) => {
    const section = { sectionId: entry.sectionId };
    if (typeof entry.lineId === "string") {
      section.lineId = entry.lineId;
    }
    return section;
  });

const normalizeResourceIds = (registry) =>
  (Array.isArray(registry?.resources) ? registry.resources : []).map((entry) =>
    typeof entry === "string" || typeof entry === "number"
      ? String(entry)
      : entry.resourceId,
  );

const markViewedInRegistry = (current, patch) => {
  const sections = normalizeStoredSections(current);
  const resources = normalizeResourceIds(current);

  normalizePatchSections(patch).forEach((sectionPatch) => {
    const existing = sections.find(
      (section) => section.sectionId === sectionPatch.sectionId,
    );
    if (!existing) {
      const section = { sectionId: sectionPatch.sectionId };
      if (sectionPatch.lineId !== undefined) {
        section.lastLineId = sectionPatch.lineId;
      }
      sections.push(section);
      return;
    }
    if (existing.lastLineId === undefined) {
      return;
    }
    if (sectionPatch.lineId === undefined) {
      delete existing.lastLineId;
      return;
    }
    existing.lastLineId = sectionPatch.lineId;
  });

  normalizeResourceIds(patch).forEach((resourceId) => {
    if (!resources.includes(resourceId)) {
      resources.push(resourceId);
    }
  });

  return {
    sections,
    resources: resources.map((resourceId) => ({ resourceId })),
  };
};

export const snapshotScopedDataUpdates = (updates = []) => {
  if (!Array.isArray(updates)) {
    throw new Error("applyScopedDataUpdates requires an updates array.");
  }
  const snapshot = cloneJsonValue(updates, "Scoped persistence updates");

  snapshot.forEach((update, index) => {
    const label = `Scoped persistence updates[${index}]`;
    requirePlainObject(update, label);
    if (typeof update.path !== "string") {
      throw new Error(`Malformed scoped persistence path at updates[${index}]`);
    }
    if (update.path.startsWith("variables.")) {
      const variableId = update.path.slice("variables.".length);
      if (variableId.length === 0) {
        throw new Error(
          `Malformed scoped persistence variable path at updates[${index}]`,
        );
      }
      if (update.op !== "set") {
        throw new Error(
          `Unsupported scoped persistence operation ${update.op} at updates[${index}]`,
        );
      }
      if (!["device", "account"].includes(update.scope)) {
        throw new Error(
          `Unsupported scoped persistence scope ${update.scope} at updates[${index}]`,
        );
      }
      validateVariableValue(update.value, `${label}.value`);
      return;
    }

    if (update.path === "viewedRegistry") {
      if (update.scope !== "account") {
        throw new Error(
          `Unsupported viewed-registry scope ${update.scope} at updates[${index}]`,
        );
      }
      if (update.op !== "markViewed") {
        throw new Error(
          `Unsupported viewed-registry operation ${update.op} at updates[${index}]`,
        );
      }
      validateViewedRegistryPatch(update.value, `${label}.value`);
      return;
    }

    throw new Error(
      `Unsupported scoped persistence path ${update.path} at updates[${index}]`,
    );
  });

  return snapshot;
};

export const applyScopedDataUpdates = (currentState, updates) => {
  const nextState = {
    ...currentState,
    globalDeviceVariables: { ...currentState.globalDeviceVariables },
    globalAccountVariables: { ...currentState.globalAccountVariables },
    accountViewedRegistry: cloneJsonValue(
      currentState.accountViewedRegistry,
      "Current account viewed registry",
    ),
  };
  const changedKeys = new Set();

  updates.forEach((update) => {
    if (update.path.startsWith("variables.")) {
      const variableId = update.path.slice("variables.".length);
      const key =
        update.scope === "device"
          ? GLOBAL_DEVICE_VARIABLES_KEY
          : GLOBAL_ACCOUNT_VARIABLES_KEY;
      const field = STATE_FIELD_BY_KEY[key];
      setOwnJsonProperty(nextState[field], variableId, update.value);
      changedKeys.add(key);
      return;
    }

    nextState.accountViewedRegistry = markViewedInRegistry(
      nextState.accountViewedRegistry,
      update.value,
    );
    changedKeys.add(ACCOUNT_VIEWED_REGISTRY_KEY);
  });

  const puts = Array.from(changedKeys).map((key) => {
    const value = nextState[STATE_FIELD_BY_KEY[key]];
    validatePlayerPersistenceValue(key, value);
    return { key, value };
  });

  return { nextState, puts };
};
