import { createTreeCollection } from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";
import { cloneLayoutElementsWithFreshIds } from "../../../../internal/project/layout.js";
import { toFlatItems } from "../../../../internal/project/tree.js";

const getLayoutsResourcePartition = ({ shared, context }) => {
  return shared.resourceTypePartitionFor(context.projectId, "layouts");
};

const submitCreateLayoutItem = async ({
  shared,
  context,
  layoutId,
  name,
  layoutType = "normal",
  elements = createTreeCollection(),
  parentId = null,
  position = "last",
  positionTargetId,
  data = {},
}) => {
  const nextLayoutId = layoutId || shared.createId();
  const resolvedIndex = shared.resolveResourceIndex({
    state: context.state,
    resourceType: "layouts",
    parentId,
    position,
    positionTargetId,
  });
  const resourcePartition = getLayoutsResourcePartition({ shared, context });
  const nextData = structuredClone(data || {});
  const itemType = nextData.type === "folder" ? "folder" : "layout";

  nextData.type = itemType;
  nextData.name = name;

  if (itemType === "layout") {
    nextData.layoutType = layoutType;
    nextData.elements = structuredClone(elements || createTreeCollection());
  }

  const submitResult = await shared.submitCommandWithContext({
    context,
    scope: "resources",
    basePartition: resourcePartition,
    type: COMMAND_TYPES.LAYOUT_CREATE,
    payload: {
      layoutId: nextLayoutId,
      data: nextData,
      ...shared.buildPlacementPayload({
        parentId,
        index: resolvedIndex,
        position,
        positionTargetId,
      }),
    },
  });

  if (submitResult?.valid === false) {
    return submitResult;
  }

  return nextLayoutId;
};

const resolveLayoutParentId = (layouts, layoutId) => {
  const flatItems = toFlatItems(layouts);
  return flatItems.find((item) => item.id === layoutId)?.parentId ?? null;
};

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
    return submitCreateLayoutItem({
      shared,
      context,
      layoutId,
      name,
      layoutType,
      elements,
      parentId,
      position,
      positionTargetId,
      data,
    });
  },

  async duplicateLayoutItem({ layoutId }) {
    const context = await shared.ensureCommandContext();
    const sourceLayout = context.state?.layouts?.items?.[layoutId];

    if (!sourceLayout || sourceLayout.type !== "layout") {
      return {
        valid: false,
        error: {
          message: "Layout not found.",
        },
      };
    }

    const sourceLayoutClone = structuredClone(sourceLayout);
    delete sourceLayoutClone.id;
    delete sourceLayoutClone.parentId;

    const {
      name,
      layoutType = "normal",
      elements = createTreeCollection(),
      ...data
    } = sourceLayoutClone;

    return submitCreateLayoutItem({
      shared,
      context,
      name,
      layoutType,
      elements: cloneLayoutElementsWithFreshIds(elements, shared.createId),
      parentId: resolveLayoutParentId(context.state?.layouts, layoutId),
      position: "after",
      positionTargetId: layoutId,
      data,
    });
  },

  async renameLayoutItem({ layoutId, name }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = getLayoutsResourcePartition({ shared, context });

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
    });
  },

  async updateLayoutItem({ layoutId, data, fileRecords = [] }) {
    const context = await shared.ensureCommandContext();
    const ensureFilesResult = await shared.ensureFilesExist({
      context,
      fileRecords,
    });
    if (ensureFilesResult?.valid === false) {
      return ensureFilesResult;
    }
    const resourcePartition = getLayoutsResourcePartition({ shared, context });

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.LAYOUT_UPDATE,
      payload: {
        layoutId,
        data: structuredClone(data || {}),
      },
    });
  },

  async deleteLayoutItem({ layoutIds }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = getLayoutsResourcePartition({ shared, context });

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.LAYOUT_DELETE,
      payload: {
        layoutIds: structuredClone(layoutIds || []),
      },
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
    const resourcePartition = getLayoutsResourcePartition({ shared, context });

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
    });
  },
});
