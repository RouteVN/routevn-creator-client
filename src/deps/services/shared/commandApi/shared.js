import { createCommandEnvelope } from "../collab/commandEnvelope.js";
import { projectRepositoryStateToDomainState } from "../../../../internal/project/projection.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";
import {
  applyCommandToRepository,
  applyCommandsToRepository,
  assertSupportedProjectState,
  getSiblingOrderNodes,
  normalizeParentId,
  resolveIndexFromPosition,
} from "../projectRepository.js";
import { collapsePartitionsToSingle } from "../collab/partitions.js";

export const createCommandApiShared = ({
  idGenerator,
  now = () => 0,
  getCurrentProjectId,
  getCurrentRepository,
  getCachedRepository,
  ensureCommandSessionForProject,
  getOrCreateLocalActor,
  storyBasePartitionFor,
  storyScenePartitionFor,
  scenePartitionFor,
  resourceTypePartitionFor,
}) => {
  const createId = () => {
    if (typeof idGenerator === "function") {
      const id = idGenerator();
      if (typeof id === "string" && id.length > 0) {
        return id;
      }
    }
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }
    throw new Error(
      "Command id generator is required when crypto.randomUUID is unavailable.",
    );
  };

  const getCommandTimestamp = () => {
    const value = Number(now());
    return Number.isFinite(value) ? value : 0;
  };

  const filePartitionFor = (projectId) =>
    resourceTypePartitionFor(projectId, "files");

  const ensureCommandContext = async ({
    sceneIds = [],
    sectionIds = [],
    lineIds = [],
  } = {}) => {
    let repository;
    try {
      repository = getCachedRepository();
    } catch {
      repository = await getCurrentRepository();
    }

    if (typeof repository?.ensureScenesLoaded === "function") {
      await repository.ensureScenesLoaded({
        sceneIds,
        sectionIds,
        lineIds,
      });
    }

    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    const state = repository.getState();
    assertSupportedProjectState(state);

    const projectId = currentProjectId;
    const session = await ensureCommandSessionForProject(currentProjectId);
    const actor =
      typeof session.getActor === "function"
        ? session.getActor()
        : getOrCreateLocalActor(currentProjectId);

    return {
      repository,
      state,
      session,
      actor,
      projectId,
      currentProjectId,
    };
  };

  const createCommandWithContext = ({
    context,
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

    return createCommandEnvelope({
      id: createId(),
      projectId: context.projectId,
      partition: resolvedPartition,
      type,
      payload,
      actor: context.actor,
      clientTs: getCommandTimestamp(),
    });
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
    if (
      typeof context.session?.syncProjectedRepositoryState === "function" &&
      typeof context.repository?.getState === "function"
    ) {
      context.session.syncProjectedRepositoryState(
        context.repository.getState(),
      );
    }

    const command = createCommandWithContext({
      context,
      scope,
      type,
      payload,
      partition,
      partitions,
      basePartition,
    });

    const submitResult = await context.session.submitCommand(command);
    if (submitResult?.valid === false) {
      return submitResult;
    }

    const applyResult = await applyCommandToRepository({
      repository: context.repository,
      command,
      projectId: context.projectId,
    });

    return {
      valid: true,
      commandId: command.id,
      eventCount: applyResult.events.length,
      applyMode: applyResult.mode,
    };
  };

  const submitCommandsWithContext = async ({ context, commands = [] } = {}) => {
    if (
      typeof context.session?.syncProjectedRepositoryState === "function" &&
      typeof context.repository?.getState === "function"
    ) {
      context.session.syncProjectedRepositoryState(
        context.repository.getState(),
      );
    }

    const normalizedCommands = (commands || []).map((entry) =>
      createCommandWithContext({
        context,
        scope: entry.scope,
        type: entry.type,
        payload: entry.payload,
        partition: entry.partition,
        partitions: entry.partitions,
        basePartition: entry.basePartition,
      }),
    );
    if (normalizedCommands.length === 0) {
      return {
        valid: true,
        commandIds: [],
        eventCount: 0,
      };
    }

    const submitResult =
      await context.session.submitCommands(normalizedCommands);
    if (submitResult?.valid === false) {
      return submitResult;
    }

    const applyResult = await applyCommandsToRepository({
      repository: context.repository,
      commands: normalizedCommands,
      projectId: context.projectId,
    });

    return {
      valid: true,
      commandIds: normalizedCommands.map((command) => command.id),
      eventCount: applyResult.events.length,
      applyMode: applyResult.mode,
    };
  };

  const ensureFilesExist = async ({ context, fileRecords = [] } = {}) => {
    const normalizedFileRecords = Array.isArray(fileRecords) ? fileRecords : [];
    if (normalizedFileRecords.length === 0) {
      return { valid: true, createdCount: 0 };
    }

    const knownFileIds = new Set(
      Object.keys(context.state?.files?.items || {}),
    );
    let createdCount = 0;

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

      const submitResult = await submitCommandWithContext({
        context,
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
      if (submitResult?.valid === false) {
        return submitResult;
      }

      knownFileIds.add(fileRecord.id);
      createdCount += 1;
    }

    return { valid: true, createdCount };
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

  const getEvents = async () => {
    const repository = await getCurrentRepository();
    return repository.getEvents();
  };

  return {
    createId,
    getCurrentProjectId,
    ensureCommandContext,
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
    getEvents,
  };
};
