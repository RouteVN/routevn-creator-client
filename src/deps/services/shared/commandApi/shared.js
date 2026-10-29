import { createCommandEnvelope } from "../collab/commandEnvelope.js";
import { projectRepositoryStateToDomainState } from "../../../../internal/project/projection.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";
import {
  applyCommandToRepository,
  applyCommandsToRepository,
  applyCommandsToRepositoryState,
  assertSupportedProjectState,
  getSiblingOrderNodes,
  normalizeParentId,
  resolveIndexFromPosition,
} from "../projectRepository.js";
import { collapsePartitionsToSingle } from "../collab/partitions.js";
import { generateId } from "../../../../internal/id.js";

const flushRepositoryMainCheckpoint = async (repository) => {
  await repository.flushMainCheckpoint();
};

const flushRepositoryMainCheckpointBestEffort = async ({
  repository,
  projectId,
}) => {
  try {
    await flushRepositoryMainCheckpoint(repository);
  } catch (error) {
    console.warn("Failed to flush repository checkpoint after command submit", {
      projectId,
      error: error?.message || String(error),
    });
  }
};

// Desktop, Android and iOS store changes as JSON, which drops undefined fields
// and turns NaN and Infinity into null. A command's payload is turned into its
// JSON form when the command is created, so the change checked and applied in
// the open project is the one that loads again on every platform.
const UNSTORABLE_PAYLOAD_ERROR = "unstorable_payload";

const toStoredPayload = (payload) => {
  if (payload === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch (cause) {
    // Such as a payload with a cycle or a BigInt.
    const error = new Error("payload must be storable as JSON", { cause });
    error.code = UNSTORABLE_PAYLOAD_ERROR;
    throw error;
  }
};

// A change whose payload cannot be stored is rejected before it is checked or
// saved, like a change that fails validation.
const toUnstorablePayloadResult = (error) => {
  if (error?.code !== UNSTORABLE_PAYLOAD_ERROR) {
    throw error;
  }
  return {
    valid: false,
    error: {
      code: "validation_failed",
      message: error.message,
    },
  };
};

// A payload holding a value its JSON form drops or changes meant something
// the stored change does not, such as clearing a field. It is reported so that
// the editor that made it can be fixed. Each command type and set of fields is
// reported once, and only a couple per session, to leave the reporter's
// budget to other errors.
const MAX_NON_JSON_PAYLOAD_REPORTS = 2;

// Adds the names of the fields of `value` that JSON drops or changes.
// Array items count as their array's field. With `ignoreUndefinedFields`,
// object fields set to undefined are skipped.
export const collectNonJsonFields = (
  value,
  field,
  fields,
  { ignoreUndefinedFields = false, seen = new WeakSet() } = {},
) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fields.add(field);
    }
    return;
  }
  const isArray = Array.isArray(value);
  const prototype = typeof value === "object" && Object.getPrototypeOf(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    fields.add(field);
    return;
  }
  if (seen.has(value)) {
    fields.add(field);
    return;
  }
  seen.add(value);
  const options = { ignoreUndefinedFields, seen };
  if (isArray) {
    value.forEach((item) => collectNonJsonFields(item, field, fields, options));
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (ignoreUndefinedFields && item === undefined) {
        continue;
      }
      collectNonJsonFields(item, key, fields, options);
    }
  }
  seen.delete(value);
};

export const createCommandApiShared = ({
  idGenerator,
  now = () => 0,
  errorTracker,
  getCurrentProjectId,
  getCurrentRepository,
  getCachedRepository,
  ensureCommandSessionForProject,
  getOrCreateLocalActor,
  storyBasePartitionFor,
  storyScenePartitionFor,
  scenePartitionFor,
  resourceTypePartitionFor,
  // Records the step a change is at, for the report of a slow change.
  markChangeStep = () => {},
}) => {
  const createId = () => {
    if (typeof idGenerator === "function") {
      const id = idGenerator();
      if (typeof id === "string" && id.length > 0) {
        return id;
      }
    }
    return generateId();
  };

  const getCommandTimestamp = () => {
    const value = Number(now());
    return Number.isFinite(value) ? value : 0;
  };

  const filePartitionFor = (projectId) =>
    resourceTypePartitionFor(projectId, "files");

  // The first change of a session also loads the project's history, which
  // takes longest in a large project: a change that names a scene, section or
  // line can load it while it reads its context, any other loads it while it
  // is applied.
  const markHistoryStep = (step, repository) => {
    markChangeStep(
      repository.isHistoryLoadPending() ? `${step}-loading-history` : step,
      repository,
    );
  };

  const ensureCommandContext = async ({
    sceneIds = [],
    sectionIds = [],
    lineIds = [],
  } = {}) => {
    markChangeStep("open-repository");
    let repository;
    try {
      repository = getCachedRepository();
    } catch {
      repository = await getCurrentRepository();
    }

    markHistoryStep("read-context", repository);
    const contextState = await repository.getContextState({
      sceneIds,
      sectionIds,
      lineIds,
    });

    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    const state = contextState;
    assertSupportedProjectState(state);

    const projectId = currentProjectId;
    markChangeStep("open-session", repository);
    const session = await ensureCommandSessionForProject(currentProjectId);
    const actor = session.getActor() ?? getOrCreateLocalActor(currentProjectId);

    return {
      repository,
      state,
      session,
      actor,
      projectId,
      currentProjectId,
    };
  };

  const reportedNonJsonPayloads = new Set();

  // Runs before the payload is turned into its JSON form, and before the
  // change is checked or saved. Reporting never stops the change.
  const reportNonJsonPayload = ({ type, payload }) => {
    if (
      !errorTracker ||
      reportedNonJsonPayloads.size >= MAX_NON_JSON_PAYLOAD_REPORTS
    ) {
      return;
    }

    try {
      const fields = new Set();
      collectNonJsonFields(payload, "payload", fields, {
        // A create or a full replace means the same without such fields.
        ignoreUndefinedFields:
          type.endsWith(".create") || payload?.replace === true,
      });
      if (fields.size === 0) {
        return;
      }
      const message = `${type}: non-JSON value in ${[...fields].sort().join(", ")}`;
      if (reportedNonJsonPayloads.has(message)) {
        return;
      }
      const error = new Error(message);
      error.name = "NonJsonCommandPayloadError";
      errorTracker.capture(error, {
        operation: "projectCommand.nonJsonPayload",
      });
      reportedNonJsonPayloads.add(message);
    } catch (failure) {
      console.warn("Failed to report a non-JSON command payload", failure);
    }
  };

  const createCommandWithContext = ({
    context,
    commandId,
    scope: _scope,
    type,
    payload,
    partition,
    partitions = [],
    basePartition,
  }) => {
    const resolvedPartition =
      typeof partition === "string" && partition.length > 0
        ? partition
        : collapsePartitionsToSingle(
            basePartition || storyBasePartitionFor(),
            partitions,
          );

    reportNonJsonPayload({ type, payload });

    return createCommandEnvelope({
      id: commandId ?? createId(),
      projectId: context.projectId,
      partition: resolvedPartition,
      type,
      payload: toStoredPayload(payload),
      actor: context.actor,
      clientTs: getCommandTimestamp(),
    });
  };

  const getContextRepositoryState = (context) => {
    if (context?.state && typeof context.state === "object") {
      return context.state;
    }
    if (context?.repository) {
      return context.repository.getState();
    }
    return null;
  };

  const validateCommandsAgainstContext = ({ context, commands = [] } = {}) => {
    const normalizedCommands = Array.isArray(commands)
      ? commands.filter(Boolean)
      : [];
    if (!context || normalizedCommands.length === 0) {
      return {
        valid: true,
        repositoryState: getContextRepositoryState(context),
      };
    }

    const repositoryState = getContextRepositoryState(context);
    if (!repositoryState) {
      return {
        valid: true,
        repositoryState: undefined,
      };
    }

    return applyCommandsToRepositoryState({
      repositoryState,
      commands: normalizedCommands,
      projectId: context.projectId,
    });
  };

  const advanceContextStateWithCommands = ({ context, commands = [] }) => {
    const normalizedCommands = Array.isArray(commands)
      ? commands.filter(Boolean)
      : [];
    if (!context || normalizedCommands.length === 0) {
      return;
    }

    const baseState = getContextRepositoryState(context);
    if (!baseState) {
      return;
    }

    let nextState = baseState;
    try {
      const applyResult = applyCommandsToRepositoryState({
        repositoryState: nextState,
        commands: normalizedCommands,
        projectId: context.projectId,
      });
      if (applyResult?.valid === false || !applyResult?.repositoryState) {
        throw new Error(
          applyResult?.error?.message ||
            `Failed to advance context for '${normalizedCommands[0]?.type || "unknown"}'`,
        );
      }
      nextState = applyResult.repositoryState;
      context.state = nextState;
    } catch {
      if (context?.repository) {
        context.state = context.repository.getState();
      }
    }
  };

  const submitCommandWithContext = async ({
    context,
    scope,
    type,
    payload,
    partition,
    partitions = [],
    basePartition,
  }) => {
    let command;
    try {
      command = createCommandWithContext({
        context,
        scope,
        type,
        payload,
        partition,
        partitions,
        basePartition,
      });
    } catch (error) {
      return toUnstorablePayloadResult(error);
    }

    const validationResult = validateCommandsAgainstContext({
      context,
      commands: [command],
    });
    if (validationResult?.valid === false) {
      return validationResult;
    }

    markChangeStep("save", context.repository);
    const submitResult = await context.session.submitCommand(command);
    if (submitResult?.valid === false) {
      return submitResult;
    }

    markHistoryStep("apply", context.repository);
    const applyResult = await applyCommandToRepository({
      repository: context.repository,
      command,
      projectId: context.projectId,
    });

    markChangeStep("save-checkpoint", context.repository);
    await flushRepositoryMainCheckpointBestEffort({
      repository: context.repository,
      projectId: context.projectId,
    });

    advanceContextStateWithCommands({
      context,
      commands: [command],
    });

    return {
      valid: true,
      commandId: command.id,
      eventCount: applyResult.events.length,
      applyMode: applyResult.mode,
    };
  };

  const submitCommandsWithContext = async ({ context, commands = [] } = {}) => {
    let normalizedCommands;
    try {
      normalizedCommands = (commands || []).map((entry) =>
        createCommandWithContext({
          context,
          commandId: entry.commandId,
          scope: entry.scope,
          type: entry.type,
          payload: entry.payload,
          partition: entry.partition,
          partitions: entry.partitions,
          basePartition: entry.basePartition,
        }),
      );
    } catch (error) {
      return toUnstorablePayloadResult(error);
    }
    if (normalizedCommands.length === 0) {
      return {
        valid: true,
        commandIds: [],
        eventCount: 0,
      };
    }

    const validationResult = validateCommandsAgainstContext({
      context,
      commands: normalizedCommands,
    });
    if (validationResult?.valid === false) {
      return validationResult;
    }

    const localApplyCommands = structuredClone(normalizedCommands);
    let submitted = false;
    try {
      markChangeStep("save", context.repository);
      const submitResult =
        await context.session.submitCommands(normalizedCommands);
      if (submitResult?.valid === false) {
        return submitResult;
      }
      submitted = true;

      markHistoryStep("apply", context.repository);
      const applyResult = await applyCommandsToRepository({
        repository: context.repository,
        commands: localApplyCommands,
        projectId: context.projectId,
      });

      markChangeStep("save-checkpoint", context.repository);
      await flushRepositoryMainCheckpointBestEffort({
        repository: context.repository,
        projectId: context.projectId,
      });

      advanceContextStateWithCommands({
        context,
        commands: localApplyCommands,
      });

      return {
        valid: true,
        commandIds: localApplyCommands.map((command) => command.id),
        eventCount: applyResult.events.length,
        applyMode: applyResult.mode,
      };
    } catch (error) {
      if (submitted) {
        error.commitOutcome = "unknown";
      }
      throw error;
    }
  };

  const buildMissingFileCommands = ({ context, fileRecords = [] } = {}) => {
    const normalizedFileRecords = Array.isArray(fileRecords) ? fileRecords : [];
    if (normalizedFileRecords.length === 0) {
      return [];
    }

    const knownFileIds = new Set(
      Object.keys(context.state?.files?.items || {}),
    );
    const commands = [];

    for (const fileRecord of normalizedFileRecords) {
      if (
        !fileRecord ||
        typeof fileRecord.id !== "string" ||
        fileRecord.id.length === 0
      ) {
        throw new Error("fileRecords must include a non-empty id");
      }

      if (knownFileIds.has(fileRecord.id)) {
        continue;
      }

      if (
        !fileRecord.mimeType ||
        !Number.isFinite(fileRecord.size) ||
        !fileRecord.sha256
      ) {
        throw new Error(
          `fileRecord ${fileRecord.id} is missing required metadata`,
        );
      }

      commands.push({
        scope: "resources",
        basePartition: filePartitionFor(context.projectId),
        type: COMMAND_TYPES.FILE_CREATE,
        payload: {
          fileId: fileRecord.id,
          data: {
            mimeType: fileRecord.mimeType,
            size: fileRecord.size,
            sha256: fileRecord.sha256,
          },
        },
      });

      knownFileIds.add(fileRecord.id);
    }

    return commands;
  };

  const ensureFilesExist = async ({ context, fileRecords = [] } = {}) => {
    const commands = buildMissingFileCommands({
      context,
      fileRecords,
    });
    if (commands.length === 0) {
      return { valid: true, createdCount: 0 };
    }

    const submitResult = await submitCommandsWithContext({
      context,
      commands,
    });
    if (submitResult?.valid === false) {
      return submitResult;
    }

    return {
      valid: true,
      createdCount: commands.length,
    };
  };

  const buildPlacementPayload = ({
    parentId = null,
    index,
    position = "last",
    positionTargetId,
  } = {}) => {
    const payload = {
      parentId: normalizeParentId(parentId),
    };

    if (index !== undefined) {
      payload.index = index;
      return payload;
    }

    payload.position = position;

    if (positionTargetId !== undefined) {
      payload.positionTargetId = positionTargetId;
    }

    return payload;
  };

  const resolveResourceIndex = ({
    state,
    resourceType,
    parentId,
    position,
    positionTargetId,
    index,
    movingId = null,
  }) => {
    if (Number.isInteger(index)) return index;
    const collection = state?.[resourceType];
    const siblings = getSiblingOrderNodes(collection, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      positionTargetId,
      movingId,
    });
  };

  const resolveSceneIndex = ({
    state,
    parentId,
    position,
    positionTargetId,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(state?.scenes, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      positionTargetId,
      movingId,
    });
  };

  const resolveSectionIndex = ({
    scene,
    parentId,
    position,
    positionTargetId,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(scene?.sections, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      positionTargetId,
      movingId,
    });
  };

  const resolveLineIndex = ({
    section,
    parentId,
    position,
    positionTargetId,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(section?.lines, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      positionTargetId,
      movingId,
    });
  };

  const resolveLayoutElementIndex = ({
    layout,
    parentId,
    position,
    positionTargetId,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(layout?.elements, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      positionTargetId,
      movingId,
    });
  };

  const resolveCharacterSpriteIndex = ({
    character,
    parentId,
    position,
    positionTargetId,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(character?.sprites, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      positionTargetId,
      movingId,
    });
  };

  const getState = () => {
    const repository = getCachedRepository();
    const state = repository.getState();
    assertSupportedProjectState(state);
    return state;
  };

  const getDomainState = () => {
    const repositoryState = getState();
    const projectId = getCurrentProjectId() || "unknown-project";
    return projectRepositoryStateToDomainState({
      repositoryState,
      projectId,
    });
  };

  return {
    createId,
    getCurrentProjectId,
    ensureCommandContext,
    buildMissingFileCommands,
    ensureFilesExist,
    createCommandWithContext,
    submitCommandWithContext,
    submitCommandsWithContext,
    buildPlacementPayload,
    resolveResourceIndex,
    resolveSceneIndex,
    resolveSectionIndex,
    resolveLineIndex,
    resolveLayoutElementIndex,
    resolveCharacterSpriteIndex,
    filePartitionFor,
    storyBasePartitionFor,
    storyScenePartitionFor,
    scenePartitionFor,
    resourceTypePartitionFor,
    getState,
    getDomainState,
  };
};
