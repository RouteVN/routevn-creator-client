import {
  createTreeCollection,
  normalizeParentId,
} from "../projectRepository.js";

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
      type: "resource.create",
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
      type: "resource.rename",
      payload: {
        resourceType: "layouts",
        resourceId: layoutId,
        name,
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
      type: "resource.delete",
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
      type: "resource.move",
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

  async updateLayoutElement({ layoutId, elementId, patch, replace = true }) {
    const context = await shared.ensureCommandContext();

    await shared.submitCommandWithContext({
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
    const context = await shared.ensureCommandContext();

    await shared.submitCommandWithContext({
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
});
