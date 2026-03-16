import { createCommandEnvelope } from "../collab/commandEnvelope.js";
import { projectRepositoryStateToDomainState } from "../../../../internal/project/projection.js";
import {
  applyCommandToRepository,
  assertSupportedProjectState,
  getSiblingOrderNodes,
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

    const projectId = state.project?.id || currentProjectId;
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

    await context.session.submitCommand(command);

    const applyResult = await applyCommandToRepository({
      repository: context.repository,
      command,
      projectId: context.projectId,
    });

    return {
      commandId: command.id,
      eventCount: applyResult.events.length,
      applyMode: applyResult.mode,
    };
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

  const resolveLayoutIndex = ({
    state,
    parentId,
    position,
    positionTargetId,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(state?.layouts, parentId);
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

  const getStateImpl = () => {
    const repository = getCachedRepository();
    const state = repository.getState();
    assertSupportedProjectState(state);
    return state;
  };

  const getDomainStateImpl = () => {
    const repositoryState = getStateImpl();
    const projectId =
      repositoryState?.project?.id ||
      getCurrentProjectId() ||
      "unknown-project";
    return projectRepositoryStateToDomainState({
      repositoryState,
      projectId,
    });
  };

  const getEventsImpl = async () => {
    const repository = await getCurrentRepository();
    return repository.getEvents();
  };

  return {
    createId,
    getCurrentProjectId,
    ensureCommandContext,
    submitCommandWithContext,
    resolveResourceIndex,
    resolveSceneIndex,
    resolveLayoutIndex,
    resolveSectionIndex,
    resolveLineIndex,
    resolveLayoutElementIndex,
    storyBasePartitionFor,
    storyScenePartitionFor,
    resourceTypePartitionFor,
    getStateImpl,
    getDomainStateImpl,
    getEventsImpl,
  };
};
