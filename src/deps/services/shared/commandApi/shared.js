import { createCommandEnvelope } from "../collab/commandEnvelope.js";
import { projectRepositoryStateToDomainState } from "../../../../internal/project/projection.js";
import {
  applyCommandToRepository,
  assertSupportedProjectState,
  getSiblingOrderNodes,
  normalizeParentId,
  resolveIndexFromPosition,
  uniquePartitions,
} from "../projectRepository.js";

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

  const ensureCommandContext = async () => {
    const repository = await getCurrentRepository();
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

  const submitCommandWithContext = async ({
    context,
    scope,
    type,
    payload,
    partitions = [],
    basePartition,
  }) => {
    const resolvedBasePartition =
      basePartition || `project:${context.projectId}:${scope}`;
    const command = createCommandEnvelope({
      id: createId(),
      projectId: context.projectId,
      scope,
      partitions: uniquePartitions(resolvedBasePartition, ...partitions),
      type,
      payload,
      actor: context.actor,
      clientTs: getCommandTimestamp(),
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
    submitCommandWithContext,
    buildPlacementPayload,
    resolveResourceIndex,
    resolveSceneIndex,
    resolveSectionIndex,
    resolveLineIndex,
    resolveLayoutElementIndex,
    resolveCharacterSpriteIndex,
    storyBasePartitionFor,
    storyScenePartitionFor,
    resourceTypePartitionFor,
    getState,
    getDomainState,
    getEvents,
  };
};
