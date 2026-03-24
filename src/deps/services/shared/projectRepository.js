import { createProjectRepositoryRuntime } from "./projectRepositoryRuntime.js";
import { validateState as validateCreatorModelState } from "@routevn/creator-model";
import {
  COMMAND_EVENT_MODEL,
  COMMAND_TYPES,
  isSupportedCommandType,
} from "../../../internal/project/commands.js";
import { applyCommandToRepositoryStateWithCreatorModel } from "../../../internal/creatorModelAdapter.js";
import {
  commandToSyncEvent,
  committedEventToCommand,
} from "./collab/mappers.js";
import {
  collapsePartitionsToSingle,
  mainPartitionFor,
} from "./collab/partitions.js";

export const createTreeCollection = () => {
  return {
    items: {},
    tree: [],
  };
};

export const initialProjectData = {
  project: {},
  story: {
    initialSceneId: null,
  },
  files: createTreeCollection(),
  images: createTreeCollection(),
  sounds: createTreeCollection(),
  videos: createTreeCollection(),
  animations: createTreeCollection(),
  characters: createTreeCollection(),
  fonts: createTreeCollection(),
  transforms: createTreeCollection(),
  colors: createTreeCollection(),
  textStyles: createTreeCollection(),
  variables: createTreeCollection(),
  layouts: createTreeCollection(),
  controls: createTreeCollection(),
  scenes: createTreeCollection(),
};

export const assertSupportedProjectState = (state) => {
  const result = validateCreatorModelState({ state });
  if (!result.valid) {
    throw new Error(
      result.error?.message || "Unsupported project repository state",
    );
  }
};

export const getHierarchyNodes = (collection) =>
  Array.isArray(collection?.tree) ? collection.tree : [];

export const normalizeParentId = (parentId) => {
  if (typeof parentId !== "string" || parentId.length === 0) return null;
  return parentId === "_root" ? null : parentId;
};

const findOrderNodeById = (nodes = [], id) => {
  for (const node of nodes) {
    if (!node || typeof node.id !== "string") continue;
    if (node.id === id) return node;
    const found = findOrderNodeById(node.children || [], id);
    if (found) return found;
  }
  return null;
};

export const getSiblingOrderNodes = (collection, parentId) => {
  const normalizedParentId = normalizeParentId(parentId);
  if (!normalizedParentId) {
    return getHierarchyNodes(collection);
  }
  const parentNode = findOrderNodeById(
    getHierarchyNodes(collection),
    normalizedParentId,
  );
  return Array.isArray(parentNode?.children) ? parentNode.children : [];
};

export const resolveIndexFromPosition = ({
  siblings = [],
  position,
  positionTargetId,
  movingId = null,
}) => {
  const filtered = Array.isArray(siblings)
    ? siblings.filter((node) => node?.id && node.id !== movingId)
    : [];

  if (position === "first") return 0;
  if (position === "last" || position === undefined || position === null) {
    return filtered.length;
  }

  if (position === "before" && typeof positionTargetId === "string") {
    const beforeIndex = filtered.findIndex(
      (node) => node.id === positionTargetId,
    );
    return beforeIndex >= 0 ? beforeIndex : filtered.length;
  }

  if (position === "after" && typeof positionTargetId === "string") {
    const afterIndex = filtered.findIndex(
      (node) => node.id === positionTargetId,
    );
    return afterIndex >= 0 ? afterIndex + 1 : filtered.length;
  }

  if (position && typeof position === "object") {
    if (typeof position.before === "string") {
      const beforeIndex = filtered.findIndex(
        (node) => node.id === position.before,
      );
      return beforeIndex >= 0 ? beforeIndex : filtered.length;
    }
    if (typeof position.after === "string") {
      const afterIndex = filtered.findIndex(
        (node) => node.id === position.after,
      );
      return afterIndex >= 0 ? afterIndex + 1 : filtered.length;
    }
  }

  return filtered.length;
};

export const findSectionLocation = (state, sectionId) => {
  const sceneItems = state?.scenes?.items || {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    const sections = scene?.sections || createTreeCollection();
    const section = sections.items?.[sectionId];
    if (!section) continue;
    return {
      sceneId,
      scene,
      section,
      sectionCollection: sections,
    };
  }
  return null;
};

export const findLineLocation = (state, lineId) => {
  const sceneItems = state?.scenes?.items || {};
  for (const [sceneId, scene] of Object.entries(sceneItems)) {
    const sections = scene?.sections?.items || {};
    for (const [sectionId, section] of Object.entries(sections)) {
      const line = section?.lines?.items?.[lineId];
      if (!line) continue;
      return {
        sceneId,
        sectionId,
        line,
      };
    }
  }
  return null;
};

const toFiniteTimestamp = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const defaultInitializationActor = (projectId) => ({
  userId: "system",
  clientId: `system-${projectId}`,
});

const defaultInitializationPartition = (projectId) =>
  mainPartitionFor(projectId);

export const createProjectCreateCommand = ({
  projectId,
  state,
  actor,
  commandId,
  clientTs,
  partition,
  meta,
}) => {
  const resolvedProjectId =
    typeof projectId === "string" && projectId.length > 0 ? projectId : "";
  if (!resolvedProjectId) {
    throw new Error("projectId is required for project.create command");
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("state is required for project.create command");
  }

  const resolvedPartition = collapsePartitionsToSingle(
    partition,
    defaultInitializationPartition(resolvedProjectId),
  );

  return {
    id:
      typeof commandId === "string" && commandId.length > 0
        ? commandId
        : `project-create:${resolvedProjectId}`,
    projectId: resolvedProjectId,
    partition: resolvedPartition,
    type: COMMAND_TYPES.PROJECT_CREATE,
    payload: {
      state: structuredClone(state),
    },
    actor: structuredClone(
      actor || defaultInitializationActor(resolvedProjectId),
    ),
    clientTs: toFiniteTimestamp(clientTs, 0),
    schemaVersion: COMMAND_EVENT_MODEL.schemaVersion,
    ...(meta !== undefined ? { meta: structuredClone(meta) } : {}),
  };
};

const resolveCommandPartition = (command) => {
  return collapsePartitionsToSingle(command?.partition);
};

const isPlainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;

const toPositiveIntegerOrNull = (value) =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;

const toFiniteNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const decodeJsonLikeValue = (value) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (value instanceof ArrayBuffer) {
    try {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(value)));
    } catch {
      return null;
    }
  }

  if (ArrayBuffer.isView(value)) {
    try {
      return JSON.parse(
        new TextDecoder().decode(
          new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
        ),
      );
    } catch {
      return null;
    }
  }

  if (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "number" &&
        Number.isInteger(item) &&
        item >= 0 &&
        item <= 255,
    )
  ) {
    try {
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(value)));
    } catch {
      return null;
    }
  }

  return null;
};

const normalizeRepositoryEventCandidate = (repositoryEvent) => {
  if (!isPlainObject(repositoryEvent)) {
    return repositoryEvent;
  }

  if (isPlainObject(repositoryEvent.event)) {
    const looksLikeEventEnvelope =
      isNonEmptyString(repositoryEvent.partition) ||
      isNonEmptyString(repositoryEvent.id) ||
      isNonEmptyString(repositoryEvent.projectId) ||
      isNonEmptyString(repositoryEvent.type) ||
      toPositiveIntegerOrNull(repositoryEvent.schemaVersion) !== null;

    if (looksLikeEventEnvelope) {
      return repositoryEvent;
    }

    return normalizeRepositoryEventCandidate(repositoryEvent.event);
  }

  if (isPlainObject(repositoryEvent.payload)) {
    return repositoryEvent;
  }

  const decoded = decodeJsonLikeValue(repositoryEvent.payload);
  if (!isPlainObject(decoded)) {
    return repositoryEvent;
  }

  const looksLikeEventEnvelope =
    isNonEmptyString(repositoryEvent.partition) ||
    isNonEmptyString(repositoryEvent.type) ||
    toPositiveIntegerOrNull(repositoryEvent.schemaVersion) !== null;

  if (looksLikeEventEnvelope) {
    return {
      ...repositoryEvent,
      payload: decoded,
    };
  }

  return decoded;
};

const failRepositoryEventValidation = (message, details = {}) => {
  const error = new Error(message);
  error.code = "validation_failed";
  error.details = details;
  throw error;
};

const normalizeRepositoryEventMeta = (meta, { defaultClientTs } = {}) => {
  const normalized = isPlainObject(meta) ? structuredClone(meta) : {};
  const clientTs =
    toFiniteNumberOrNull(normalized.clientTs) ??
    toFiniteNumberOrNull(defaultClientTs);

  if (clientTs === null) {
    failRepositoryEventValidation(
      "repository event meta.clientTs must be a finite number",
    );
  }

  normalized.clientTs = clientTs;

  if (!isNonEmptyString(normalized.clientId)) {
    delete normalized.clientId;
  }

  return normalized;
};

const validateRepositoryCommandEvent = (repositoryEvent) => {
  const normalizedRepositoryEvent =
    normalizeRepositoryEventCandidate(repositoryEvent);

  if (!isPlainObject(normalizedRepositoryEvent)) {
    failRepositoryEventValidation("repository event is required");
  }

  if (!isNonEmptyString(normalizedRepositoryEvent.partition)) {
    failRepositoryEventValidation("repository event partition is required");
  }

  if (!isNonEmptyString(normalizedRepositoryEvent.id)) {
    failRepositoryEventValidation("repository event id is required");
  }

  if (!isNonEmptyString(normalizedRepositoryEvent.type)) {
    failRepositoryEventValidation("repository event type is required");
  }

  if (
    toPositiveIntegerOrNull(normalizedRepositoryEvent.schemaVersion) === null
  ) {
    failRepositoryEventValidation(
      "repository event schemaVersion must be a positive integer",
    );
  }

  if (!isPlainObject(normalizedRepositoryEvent.payload)) {
    failRepositoryEventValidation("repository event payload is required");
  }

  if (!isNonEmptyString(normalizedRepositoryEvent.projectId)) {
    failRepositoryEventValidation("repository event projectId is required");
  }

  if (
    normalizedRepositoryEvent.userId !== undefined &&
    !isNonEmptyString(normalizedRepositoryEvent.userId)
  ) {
    failRepositoryEventValidation(
      "repository event userId must be a non-empty string when provided",
    );
  }

  return {
    ...normalizedRepositoryEvent,
    meta: normalizeRepositoryEventMeta(normalizedRepositoryEvent.meta),
  };
};

export const isRepositoryCommandEvent = (repositoryEvent) => {
  try {
    validateRepositoryCommandEvent(repositoryEvent);
    return true;
  } catch {
    return false;
  }
};

export const assertRepositoryCommandEvent = (repositoryEvent) => {
  return validateRepositoryCommandEvent(repositoryEvent);
};

export const createRepositoryCommandEvent = ({ command }) => {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw new Error("command is required to create a repository event");
  }

  const partition = resolveCommandPartition(command);

  const repositoryEvent = {
    id: command.id,
    partition,
    ...commandToSyncEvent(command),
  };
  return assertRepositoryCommandEvent(repositoryEvent);
};

export const repositoryEventToCommand = (repositoryEvent) => {
  const normalizedRepositoryEvent =
    assertRepositoryCommandEvent(repositoryEvent);
  const command = committedEventToCommand(normalizedRepositoryEvent);
  if (!command) {
    throw new Error("Failed to convert repository event to command");
  }
  return command;
};

export const createProjectCreateRepositoryEvent = ({
  projectId,
  state,
  actor,
  commandId,
  clientTs,
  partition,
  meta,
}) =>
  createRepositoryCommandEvent({
    command: createProjectCreateCommand({
      projectId,
      state,
      actor,
      commandId,
      clientTs,
      partition,
      meta,
    }),
  });

export const isDirectDomainProjectionCommand = (command) =>
  isSupportedCommandType(command?.type);

export const applyCommandToRepositoryState = ({
  repositoryState,
  command,
  projectId,
}) => {
  return applyCommandToRepositoryStateWithCreatorModel({
    repositoryState,
    command,
    projectId,
  });
};

const applyRepositoryEventToRepositoryState = ({
  repositoryState,
  event,
  projectId,
}) => {
  const command = repositoryEventToCommand(event);
  if (!isDirectDomainProjectionCommand(command)) {
    throw new Error(
      `No command projection handler for command type '${command?.type || "unknown"}'`,
    );
  }

  const applyResult = applyCommandToRepositoryState({
    repositoryState,
    command,
    projectId,
  });

  if (!applyResult.valid) {
    const error = new Error(
      applyResult.error?.message || "Failed to apply repository event",
    );
    error.code = applyResult.error?.code || "validation_failed";
    error.details = applyResult.error?.details ?? {};
    throw error;
  }

  return applyResult.repositoryState;
};

const createInitialRepositoryStateForProject = () =>
  structuredClone(initialProjectData);

export const createProjectRepository = async ({
  projectId,
  store,
  events: sourceEvents = [],
}) =>
  createProjectRepositoryRuntime({
    projectId,
    store,
    events: sourceEvents,
    createInitialState: () => createInitialRepositoryStateForProject(),
    reduceEventToState: ({ repositoryState, event }) =>
      applyRepositoryEventToRepositoryState({
        repositoryState,
        event,
        projectId,
      }),
    assertState: assertSupportedProjectState,
  });

export const applyCommandToRepository = async ({
  repository,
  command,
  projectId,
}) => {
  if (!isDirectDomainProjectionCommand(command)) {
    throw new Error(
      `No command projection handler for command type '${command?.type || "unknown"}'`,
    );
  }

  const repositoryCommand = {
    ...structuredClone(command),
    projectId: command?.projectId || projectId,
  };

  await repository.addEvent(
    createRepositoryCommandEvent({
      command: repositoryCommand,
    }),
  );

  return {
    mode: "command_event",
    events: [
      {
        type: repositoryCommand.type,
        payload: structuredClone(repositoryCommand.payload || {}),
      },
    ],
  };
};

export const applyCommandsToRepository = async ({
  repository,
  commands = [],
  projectId,
}) => {
  const normalizedCommands = Array.isArray(commands)
    ? commands.filter(Boolean)
    : [];
  if (normalizedCommands.length === 0) {
    return {
      mode: "command_event",
      events: [],
    };
  }

  for (const command of normalizedCommands) {
    if (!isDirectDomainProjectionCommand(command)) {
      throw new Error(
        `No command projection handler for command type '${command?.type || "unknown"}'`,
      );
    }
  }

  const repositoryCommands = normalizedCommands.map((command) => ({
    ...structuredClone(command),
    projectId: command?.projectId || projectId,
  }));
  const repositoryEvents = repositoryCommands.map((command) =>
    createRepositoryCommandEvent({
      command,
    }),
  );

  if (typeof repository.addEvents === "function") {
    await repository.addEvents(repositoryEvents);
  } else {
    for (const event of repositoryEvents) {
      await repository.addEvent(event);
    }
  }

  return {
    mode: "command_event",
    events: repositoryCommands.map((repositoryCommand) => ({
      type: repositoryCommand.type,
      payload: structuredClone(repositoryCommand.payload || {}),
    })),
  };
};
