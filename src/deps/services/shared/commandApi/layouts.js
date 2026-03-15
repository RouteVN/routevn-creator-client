import {
  createTreeCollection,
  normalizeParentId,
} from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createLayoutCommandApi = (shared) => ({
  async createLayoutItem({
    layoutId,
    name,
    layoutType = "normal",
    elements = createTreeCollection(),
    parentId = null,
    position = "last",
    data = {},
  }) {
    const context = await shared.ensureCommandContext();
    const nextLayoutId = layoutId || shared.createId();
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType: "layouts",
      parentId,
      position,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_CREATE,
      payload: {
        resourceType: "layouts",
        resourceId: nextLayoutId,
        data: {
          ...structuredClone(data || {}),
          name,
          layoutType,
          elements: structuredClone(elements || createTreeCollection()),
        },
        parentId: normalizeParentId(parentId),
        index: resolvedIndex,
        position,
      },
      partitions: [],
    });

    return nextLayoutId;
  },

  async renameLayoutItem({ layoutId, name }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_UPDATE,
      payload: {
        resourceType: "layouts",
        resourceId: layoutId,
        data: {
          name,
        },
      },
      partitions: [],
    });
  },

  async deleteLayoutItem({ layoutId }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_DELETE,
      payload: {
        resourceType: "layouts",
        resourceId: layoutId,
      },
      partitions: [],
    });
  },

  async reorderLayoutItem({
    layoutId,
    parentId = null,
    position = "last",
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType: "layouts",
      parentId,
      position,
      index,
      movingId: layoutId,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_MOVE,
      payload: {
        resourceType: "layouts",
        resourceId: layoutId,
        parentId: normalizeParentId(parentId),
        index: resolvedIndex,
        position,
      },
      partitions: [],
    });
  },

  async updateLayoutElement({
    layoutId,
    elementId,
    data,
    patch,
    replace = true,
  }) {
    const context = await shared.ensureCommandContext();

    await shared.submitCommandWithContext({
      context,
      scope: "layouts",
      type: COMMAND_TYPES.LAYOUT_ELEMENT_UPDATE,
      payload: {
        layoutId,
        elementId,
        data: structuredClone(data ?? patch ?? {}),
        replace: replace === true,
      },
      partitions: [],
    });
  },

  async createLayoutElement({
    layoutId,
    elementId,
    data,
    element,
    parentId = null,
    position = "last",
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const nextElementId = elementId || shared.createId();
    const layout = context.state?.layouts?.items?.[layoutId];
    const resolvedIndex = shared.resolveLayoutElementIndex({
      layout,
      parentId,
      position,
      index,
    });

    await shared.submitCommandWithContext({
      context,
      scope: "layouts",
      type: COMMAND_TYPES.LAYOUT_ELEMENT_CREATE,
      payload: {
        layoutId,
        elementId: nextElementId,
        data: structuredClone(data ?? element ?? {}),
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
    const context = await shared.ensureCommandContext();
    const layout = context.state?.layouts?.items?.[layoutId];
    const resolvedIndex = shared.resolveLayoutElementIndex({
      layout,
      parentId,
      position,
      index,
      movingId: elementId,
    });

    await shared.submitCommandWithContext({
      context,
      scope: "layouts",
      type: COMMAND_TYPES.LAYOUT_ELEMENT_MOVE,
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
    const context = await shared.ensureCommandContext();

    await shared.submitCommandWithContext({
      context,
      scope: "layouts",
      type: COMMAND_TYPES.LAYOUT_ELEMENT_DELETE,
      payload: {
        layoutId,
        elementId,
      },
      partitions: [],
    });
  },
});
