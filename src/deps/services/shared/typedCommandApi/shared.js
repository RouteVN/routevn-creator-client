import { createCommandEnvelope } from "../../../../collab/v2/index.js";
import { projectRepositoryStateToDomainState } from "../../../../domain/v2/stateProjection.js";
import {
  applyTypedCommandToRepository,
  assertV2State,
  getSiblingOrderNodes,
  resolveIndexFromPosition,
  uniquePartitions,
} from "../typedProjectRepository.js";

export const createTypedCommandShared = ({
  idGenerator,
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
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const ensureTypedCommandContext = async () => {
    const repository = await getCurrentRepository();
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) {
      throw new Error("No project selected (missing ?p= in URL)");
    }
    const state = repository.getState();
    assertV2State(state);

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

  const submitTypedCommandWithContext = async ({
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
      projectId: context.projectId,
      scope,
      partition: resolvedBasePartition,
      partitions: uniquePartitions(resolvedBasePartition, ...partitions),
      type,
      payload,
      actor: context.actor,
    });

    await context.session.submitCommand(command);

    const applyResult = await applyTypedCommandToRepository({
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
    index,
    movingId = null,
  }) => {
    if (Number.isInteger(index)) return index;
    const collection = state?.[resourceType];
    const siblings = getSiblingOrderNodes(collection, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveSceneIndex = ({
    state,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(state?.scenes, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveSectionIndex = ({
    scene,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(scene?.sections, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveLineIndex = ({
    section,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(section?.lines, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const resolveLayoutElementIndex = ({
    layout,
    parentId,
    position,
    index,
    movingId,
  }) => {
    if (Number.isInteger(index)) return index;
    const siblings = getSiblingOrderNodes(layout?.elements, parentId);
    return resolveIndexFromPosition({
      siblings,
      position,
      movingId,
    });
  };

  const getStateImpl = () => {
    const repository = getCachedRepository();
    const state = repository.getState();
    assertV2State(state);
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
    ensureTypedCommandContext,
    submitTypedCommandWithContext,
    resolveResourceIndex,
    resolveSceneIndex,
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
