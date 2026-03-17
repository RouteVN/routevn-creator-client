import { createTreeCollection } from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createLayoutCommandApi = (shared) => ({
  async createLayoutItem({
    layoutId,
    name,
    layoutType = "normal",
    elements = createTreeCollection(),
    parentId = null,
    position = "last",
    positionTargetId,
    data = {},
  }) {
    const context = await shared.ensureCommandContext();
    const nextLayoutId = layoutId || shared.createId();
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType: "layouts",
      parentId,
      position,
      positionTargetId,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    const submitResult = await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.LAYOUT_CREATE,
      payload: {
        layoutId: nextLayoutId,
        data: {
          ...structuredClone(data || {}),
          name,
          layoutType,
          elements: structuredClone(elements || createTreeCollection()),
        },
        ...shared.buildPlacementPayload({
          parentId,
          index: resolvedIndex,
          position,
          positionTargetId,
        }),
      },
      partitions: [],
    });

    if (submitResult?.valid === false) {
      return submitResult;
    }

    return nextLayoutId;
  },

  async renameLayoutItem({ layoutId, name }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.LAYOUT_UPDATE,
      payload: {
        layoutId,
        data: {
          name,
        },
      },
      partitions: [],
    });
  },

  async updateLayoutItem({ layoutId, data }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.LAYOUT_UPDATE,
      payload: {
        layoutId,
        data: structuredClone(data || {}),
      },
      partitions: [],
    });
  },

  async deleteLayoutItem({ layoutIds }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.LAYOUT_DELETE,
      payload: {
        layoutIds: structuredClone(layoutIds || []),
      },
      partitions: [],
    });
  },

  async reorderLayoutItem({
    layoutId,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType: "layouts",
      parentId,
      position,
      positionTargetId,
      index,
      movingId: layoutId,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "layouts",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.LAYOUT_MOVE,
      payload: {
        layoutId,
        ...shared.buildPlacementPayload({
          parentId,
          index: resolvedIndex,
          position,
          positionTargetId,
        }),
      },
      partitions: [],
    });
  },

  async updateLayoutElement({ layoutId, elementId, data, replace = true }) {
    const context = await shared.ensureCommandContext();

    return shared.submitCommandWithContext({
      context,
      scope: "layouts",
      type: COMMAND_TYPES.LAYOUT_ELEMENT_UPDATE,
      payload: {
        layoutId,
        elementId,
        data: structuredClone(data || {}),
        replace: replace === true,
      },
      partitions: [],
    });
  },

  async createLayoutElement({
    layoutId,
    elementId,
    data,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const nextElementId = elementId || shared.createId();
    const layout = context.state?.layouts?.items?.[layoutId];
    const resolvedIndex = shared.resolveLayoutElementIndex({
      layout,
      parentId,
      position,
      positionTargetId,
      index,
    });

    const submitResult = await shared.submitCommandWithContext({
      context,
      scope: "layouts",
      type: COMMAND_TYPES.LAYOUT_ELEMENT_CREATE,
      payload: {
        layoutId,
        elementId: nextElementId,
        data: structuredClone(data || {}),
        ...shared.buildPlacementPayload({
          parentId,
          index: resolvedIndex,
          position,
          positionTargetId,
        }),
      },
      partitions: [],
    });

    if (submitResult?.valid === false) {
      return submitResult;
    }

    return nextElementId;
  },

  async moveLayoutElement({
    layoutId,
    elementId,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const layout = context.state?.layouts?.items?.[layoutId];
    const resolvedIndex = shared.resolveLayoutElementIndex({
      layout,
      parentId,
      position,
      positionTargetId,
      index,
      movingId: elementId,
    });

    return shared.submitCommandWithContext({
      context,
      scope: "layouts",
      type: COMMAND_TYPES.LAYOUT_ELEMENT_MOVE,
      payload: {
        layoutId,
        elementId,
        ...shared.buildPlacementPayload({
          parentId,
          index: resolvedIndex,
          position,
          positionTargetId,
        }),
      },
      partitions: [],
    });
  },

  async deleteLayoutElement({ layoutId, elementIds }) {
    const context = await shared.ensureCommandContext();

    return shared.submitCommandWithContext({
      context,
      scope: "layouts",
      type: COMMAND_TYPES.LAYOUT_ELEMENT_DELETE,
      payload: {
        layoutId,
        elementIds: structuredClone(elementIds || []),
      },
      partitions: [],
    });
  },
});
