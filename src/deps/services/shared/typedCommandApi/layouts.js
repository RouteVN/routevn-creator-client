import {
  createTreeCollection,
  normalizeParentId,
} from "../typedProjectRepository.js";

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
    const context = await shared.ensureTypedCommandContext();
    const nextLayoutId = layoutId || shared.createId();

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();

    await shared.submitTypedCommandWithContext({
      context,
      scope: "layouts",
      type: "layout.delete",
      payload: {
        layoutId,
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
    const context = await shared.ensureTypedCommandContext();
    const resolvedIndex = shared.resolveLayoutIndex({
      state: context.state,
      parentId,
      position,
      index,
      movingId: layoutId,
    });

    await shared.submitTypedCommandWithContext({
      context,
      scope: "layouts",
      type: "layout.reorder",
      payload: {
        layoutId,
        parentId: normalizeParentId(parentId),
        index: resolvedIndex,
        position,
      },
      partitions: [],
    });
  },

  async updateLayoutElement({ layoutId, elementId, patch, replace = true }) {
    const context = await shared.ensureTypedCommandContext();

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const nextElementId = elementId || shared.createId();
    const layout = context.state?.layouts?.items?.[layoutId];
    const resolvedIndex = shared.resolveLayoutElementIndex({
      layout,
      parentId,
      position,
      index,
    });

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const layout = context.state?.layouts?.items?.[layoutId];
    const resolvedIndex = shared.resolveLayoutElementIndex({
      layout,
      parentId,
      position,
      index,
      movingId: elementId,
    });

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();

    await shared.submitTypedCommandWithContext({
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
