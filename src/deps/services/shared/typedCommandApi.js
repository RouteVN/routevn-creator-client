import { createCommandEnvelope } from "../../../collab/v2/index.js";
import { projectRepositoryStateToDomainState } from "../../../domain/v2/stateProjection.js";
import {
  applyTypedCommandToRepository,
  assertV2State,
  createTreeCollection,
  findLineLocation,
  findSectionLocation,
  getSiblingOrderNodes,
  normalizeParentId,
  resolveIndexFromPosition,
  uniquePartitions,
} from "./typedProjectRepository.js";

export const createTypedCommandApi = ({
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

  return {
    async updateProjectFields({ patch }) {
      const context = await ensureTypedCommandContext();
      const keys = Object.keys(patch || {}).filter(
        (key) =>
          key && key !== "id" && key !== "createdAt" && key !== "updatedAt",
      );
      if (keys.length === 0) return;

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "project.update",
        payload: {
          patch: structuredClone(patch),
        },
        partitions: [],
      });
    },

    async createSceneItem({
      sceneId,
      name,
      parentId = null,
      position = "last",
      index,
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const finalSceneId = sceneId || createId();
      const resolvedIndex = resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(
        context.projectId,
        finalSceneId,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.create",
        payload: {
          sceneId: finalSceneId,
          name,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
          data: structuredClone(data || {}),
        },
        partitions: [basePartition, scenePartition],
      });
      return finalSceneId;
    },

    async updateSceneItem({ sceneId, patch }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.update",
        payload: {
          sceneId,
          patch: structuredClone(patch || {}),
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async renameSceneItem({ sceneId, name }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.rename",
        payload: {
          sceneId,
          name,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async deleteSceneItem({ sceneId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.delete",
        payload: {
          sceneId,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async setInitialScene({ sceneId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.set_initial",
        payload: {
          sceneId,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async reorderSceneItem({
      sceneId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const resolvedIndex = resolveSceneIndex({
        state: context.state,
        parentId,
        position,
        index,
        movingId: sceneId,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "scene.reorder",
        payload: {
          sceneId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [basePartition, scenePartition],
      });
    },

    async createSectionItem({
      sceneId,
      sectionId,
      name,
      parentId = null,
      position = "last",
      index,
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const nextSectionId = sectionId || createId();
      const scene = context.state?.scenes?.items?.[sceneId];
      const resolvedIndex = resolveSectionIndex({
        scene,
        parentId,
        position,
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = storyScenePartitionFor(context.projectId, sceneId);

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.create",
        payload: {
          sceneId,
          sectionId: nextSectionId,
          name,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
          data: structuredClone(data || {}),
        },
        partitions: [basePartition, scenePartition],
      });

      return nextSectionId;
    },

    async renameSectionItem({ sceneId, sectionId, name }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const sceneIdForPartition = sceneId || sectionLocation?.sceneId;
      const scenePartition = sceneIdForPartition
        ? storyScenePartitionFor(context.projectId, sceneIdForPartition)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.rename",
        payload: {
          sectionId,
          name,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async deleteSectionItem({ sceneId, sectionId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const sceneIdForPartition = sceneId || sectionLocation?.sceneId;
      const scenePartition = sceneIdForPartition
        ? storyScenePartitionFor(context.projectId, sceneIdForPartition)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.delete",
        payload: {
          sectionId,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async reorderSectionItem({
      sectionId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const resolvedIndex = resolveSectionIndex({
        scene: sectionLocation?.scene,
        parentId,
        position,
        index,
        movingId: sectionId,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, sectionLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "section.reorder",
        payload: {
          sectionId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async createLineItem({
      sectionId,
      lineId,
      line = {},
      afterLineId,
      parentId = null,
      position,
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextLineId = lineId || createId();
      const sectionLocation = findSectionLocation(context.state, sectionId);
      const resolvedPosition =
        position || (afterLineId ? { after: afterLineId } : undefined);
      const resolvedIndex = resolveLineIndex({
        section: sectionLocation?.section,
        parentId,
        position: resolvedPosition || "last",
        index,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const scenePartition = sectionLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, sectionLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.insert_after",
        payload: {
          sectionId,
          lineId: nextLineId,
          line: structuredClone(line || {}),
          afterLineId: afterLineId || null,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position: resolvedPosition || "last",
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });

      return nextLineId;
    },

    async updateLineActions({ lineId, patch, replace = false }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const lineLocation = findLineLocation(context.state, lineId);
      const scenePartition = lineLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, lineLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.update_actions",
        payload: {
          lineId,
          patch: structuredClone(patch || {}),
          replace: replace === true,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async deleteLineItem({ lineId }) {
      const context = await ensureTypedCommandContext();
      const basePartition = storyBasePartitionFor(context.projectId);
      const lineLocation = findLineLocation(context.state, lineId);
      const scenePartition = lineLocation?.sceneId
        ? storyScenePartitionFor(context.projectId, lineLocation.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.delete",
        payload: {
          lineId,
        },
        partitions: scenePartition
          ? [basePartition, scenePartition]
          : [basePartition],
      });
    },

    async moveLineItem({
      lineId,
      toSectionId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const targetSection = findSectionLocation(context.state, toSectionId);
      const resolvedIndex = resolveLineIndex({
        section: targetSection?.section,
        parentId,
        position,
        index,
        movingId: lineId,
      });
      const basePartition = storyBasePartitionFor(context.projectId);
      const sourceLine = findLineLocation(context.state, lineId);
      const sourceScenePartition = sourceLine?.sceneId
        ? storyScenePartitionFor(context.projectId, sourceLine.sceneId)
        : null;
      const targetScenePartition = targetSection?.sceneId
        ? storyScenePartitionFor(context.projectId, targetSection.sceneId)
        : null;

      await submitTypedCommandWithContext({
        context,
        scope: "story",
        type: "line.move",
        payload: {
          lineId,
          toSectionId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [basePartition, sourceScenePartition, targetScenePartition],
      });
    },

    async createResourceItem({
      resourceType,
      resourceId,
      data,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextResourceId = resourceId || createId();
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId,
        position,
        index,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.create",
        payload: {
          resourceType,
          resourceId: nextResourceId,
          data: structuredClone(data),
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
      return nextResourceId;
    },

    async updateResourceItem({ resourceType, resourceId, patch }) {
      const context = await ensureTypedCommandContext();
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.update",
        payload: {
          resourceType,
          resourceId,
          patch: structuredClone(patch),
        },
        partitions: [],
      });
    },

    async moveResourceItem({
      resourceType,
      resourceId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId,
        position,
        index,
        movingId: resourceId,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.move",
        payload: {
          resourceType,
          resourceId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
    },

    async deleteResourceItem({ resourceType, resourceId }) {
      const context = await ensureTypedCommandContext();
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.delete",
        payload: {
          resourceType,
          resourceId,
        },
        partitions: [],
      });
    },

    async duplicateResourceItem({
      resourceType,
      sourceId,
      newId,
      parentId,
      position,
      index,
      name,
    }) {
      const context = await ensureTypedCommandContext();
      const collection = context.state?.[resourceType];
      const sourceItem = collection?.items?.[sourceId];
      const resolvedParentId = normalizeParentId(
        parentId ?? sourceItem?.parentId ?? null,
      );
      const resolvedPosition = position || { after: sourceId };
      const resolvedIndex = resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId: resolvedParentId,
        position: resolvedPosition,
        index,
      });
      const resourcePartition = resourceTypePartitionFor(
        context.projectId,
        resourceType,
      );

      await submitTypedCommandWithContext({
        context,
        scope: "resources",
        basePartition: resourcePartition,
        type: "resource.duplicate",
        payload: {
          resourceType,
          sourceId,
          newId,
          parentId: resolvedParentId,
          index: resolvedIndex,
          position: resolvedPosition,
          name: typeof name === "string" && name.length > 0 ? name : undefined,
        },
        partitions: [],
      });
    },

    async createLayoutItem({
      layoutId,
      name,
      layoutType = "normal",
      elements = createTreeCollection(),
      parentId = null,
      position = "last",
      data = {},
    }) {
      const context = await ensureTypedCommandContext();
      const nextLayoutId = layoutId || createId();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.create",
        payload: {
          layoutId: nextLayoutId,
          name,
          layoutType,
          elements: structuredClone(elements || createTreeCollection()),
          parentId: normalizeParentId(parentId),
          position,
          data: structuredClone(data || {}),
        },
        partitions: [],
      });

      return nextLayoutId;
    },

    async renameLayoutItem({ layoutId, name }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.rename",
        payload: {
          layoutId,
          name,
        },
        partitions: [],
      });
    },

    async deleteLayoutItem({ layoutId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.delete",
        payload: {
          layoutId,
        },
        partitions: [],
      });
    },

    async updateLayoutElement({ layoutId, elementId, patch, replace = true }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.update",
        payload: {
          layoutId,
          elementId,
          patch: structuredClone(patch || {}),
          replace: replace === true,
        },
        partitions: [],
      });
    },

    async createLayoutElement({
      layoutId,
      elementId,
      element,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const nextElementId = elementId || createId();
      const layout = context.state?.layouts?.items?.[layoutId];
      const resolvedIndex = resolveLayoutElementIndex({
        layout,
        parentId,
        position,
        index,
      });

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.create",
        payload: {
          layoutId,
          elementId: nextElementId,
          element: structuredClone(element || {}),
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });

      return nextElementId;
    },

    async moveLayoutElement({
      layoutId,
      elementId,
      parentId = null,
      position = "last",
      index,
    }) {
      const context = await ensureTypedCommandContext();
      const layout = context.state?.layouts?.items?.[layoutId];
      const resolvedIndex = resolveLayoutElementIndex({
        layout,
        parentId,
        position,
        index,
        movingId: elementId,
      });

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.move",
        payload: {
          layoutId,
          elementId,
          parentId: normalizeParentId(parentId),
          index: resolvedIndex,
          position,
        },
        partitions: [],
      });
    },

    async deleteLayoutElement({ layoutId, elementId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "layouts",
        type: "layout.element.delete",
        payload: {
          layoutId,
          elementId,
        },
        partitions: [],
      });
    },

    async createVariableItem({
      variableId,
      name,
      scope = "global",
      type = "string",
      defaultValue = "",
      parentId = null,
      position = "last",
    }) {
      const context = await ensureTypedCommandContext();
      const nextVariableId = variableId || createId();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.create",
        payload: {
          variableId: nextVariableId,
          name,
          variableType: type,
          initialValue: defaultValue,
          parentId: normalizeParentId(parentId),
          position,
          data: {
            scope,
          },
        },
        partitions: [],
      });

      return nextVariableId;
    },

    async updateVariableItem({ variableId, patch }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.update",
        payload: {
          variableId,
          patch: structuredClone(patch || {}),
        },
        partitions: [],
      });
    },

    async deleteVariableItem({ variableId }) {
      const context = await ensureTypedCommandContext();

      await submitTypedCommandWithContext({
        context,
        scope: "settings",
        type: "variable.delete",
        payload: {
          variableId,
        },
        partitions: [],
      });
    },

    getState: getStateImpl,

    getDomainState: getDomainStateImpl,

    async getEvents() {
      const repository = await getCurrentRepository();
      return repository.getEvents();
    },
  };
};
