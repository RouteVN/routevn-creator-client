import { createProjectRepositoryRuntime } from "./projectRepositoryRuntime.js";
import { validateState as validateCreatorModelState } from "@routevn/creator-model";
import {
  COMMAND_EVENT_MODEL,
  COMMAND_TYPES,
  isSupportedCommandType,
} from "../../../internal/project/commands.js";
import { applyCommandToRepositoryStateWithCreatorModel } from "../../../internal/creatorModelAdapter.js";
import { validateCommandSubmitItem } from "insieme/client";
import {
  commandToSyncEvent,
  committedEventToCommand,
} from "./collab/mappers.js";

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

export const uniquePartitions = (...partitions) => {
  const seen = new Set();
  const output = [];
  for (const partition of partitions) {
    if (typeof partition !== "string" || partition.length === 0) continue;
    if (seen.has(partition)) continue;
    seen.add(partition);
    output.push(partition);
  }
  return output;
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

const isNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;

const toFiniteTimestamp = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const defaultInitializationActor = (projectId) => ({
  userId: "system",
  clientId: `system-${projectId}`,
});

const defaultInitializationPartition = (projectId) =>
  `project:${projectId}:settings`;

export const createProjectCreateCommand = ({
  projectId,
  state,
  actor,
  commandId,
  clientTs,
  partitions,
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

  const basePartition =
    (Array.isArray(partitions)
      ? partitions.find(
          (value) => typeof value === "string" && value.length > 0,
        )
      : null) || defaultInitializationPartition(resolvedProjectId);
  const resolvedPartitions = Array.from(
    new Set(
      [basePartition]
        .concat(Array.isArray(partitions) ? partitions : [])
        .filter((value) => typeof value === "string" && value.length > 0),
    ),
  );

  return {
    id:
      typeof commandId === "string" && commandId.length > 0
        ? commandId
        : `project-create:${resolvedProjectId}`,
    projectId: resolvedProjectId,
    partitions: resolvedPartitions,
    type: COMMAND_TYPES.PROJECT_CREATE,
    payload: {
      state: structuredClone(state),
    },
    actor: structuredClone(
      actor || defaultInitializationActor(resolvedProjectId),
    ),
    clientTs: toFiniteTimestamp(clientTs, 0),
    commandVersion: COMMAND_EVENT_MODEL.commandVersion,
    ...(meta !== undefined ? { meta: structuredClone(meta) } : {}),
  };
};

const resolveCommandPartitions = (command) => {
  const partitions = [];
  const seen = new Set();

  const push = (value) => {
    if (!isNonEmptyString(value) || seen.has(value)) return;
    seen.add(value);
    partitions.push(value);
  };

  for (const partition of Array.isArray(command?.partitions)
    ? command.partitions
    : []) {
    push(partition);
  }

  return partitions;
};

export const isRepositoryCommandEvent = (repositoryEvent) => {
  try {
    validateCommandSubmitItem(repositoryEvent);
    return true;
  } catch {
    return false;
  }
};

export const assertRepositoryCommandEvent = (repositoryEvent) => {
  validateCommandSubmitItem(repositoryEvent);
  return repositoryEvent;
};

export const createRepositoryCommandEvent = ({ command }) => {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw new Error("command is required to create a repository event");
  }

  const partitions = resolveCommandPartitions(command);
  if (partitions.length === 0) {
    throw new Error("command partitions are required");
  }

  const repositoryEvent = {
    id: command.id,
    partitions,
    ...commandToSyncEvent(command),
  };
  assertRepositoryCommandEvent(repositoryEvent);
  return repositoryEvent;
};

export const repositoryEventToCommand = (repositoryEvent) => {
  assertRepositoryCommandEvent(repositoryEvent);
  const command = committedEventToCommand(repositoryEvent);
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
  partitions,
  meta,
}) =>
  createRepositoryCommandEvent({
    command: createProjectCreateCommand({
      projectId,
      state,
      actor,
      commandId,
      clientTs,
      partitions,
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
