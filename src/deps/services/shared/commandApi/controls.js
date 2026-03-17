import { createTreeCollection } from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createControlCommandApi = (shared) => ({
  async createControlItem({
    controlId,
    name,
    elements = createTreeCollection(),
    parentId = null,
    position = "last",
    positionTargetId,
    data = {},
  }) {
    const context = await shared.ensureCommandContext();
    const nextControlId = controlId || shared.createId();
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType: "controls",
      parentId,
      position,
      positionTargetId,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "controls",
    );

    const submitResult = await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CONTROL_CREATE,
      payload: {
        controlId: nextControlId,
        data: {
          ...structuredClone(data || {}),
          type: data?.type || "control",
          name,
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

    return nextControlId;
  },

  async renameControlItem({ controlId, name }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "controls",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CONTROL_UPDATE,
      payload: {
        controlId,
        data: {
          name,
        },
      },
      partitions: [],
    });
  },

  async updateControlItem({ controlId, data }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "controls",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CONTROL_UPDATE,
      payload: {
        controlId,
        data: structuredClone(data || {}),
      },
      partitions: [],
    });
  },

  async deleteControlItem({ controlIds }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "controls",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CONTROL_DELETE,
      payload: {
        controlIds: structuredClone(controlIds || []),
      },
      partitions: [],
    });
  },

  async reorderControlItem({
    controlId,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType: "controls",
      parentId,
      position,
      positionTargetId,
      index,
      movingId: controlId,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "controls",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CONTROL_MOVE,
      payload: {
        controlId,
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

  async updateControlElement({ controlId, elementId, data, replace = true }) {
    const context = await shared.ensureCommandContext();

    return shared.submitCommandWithContext({
      context,
      scope: "controls",
      type: COMMAND_TYPES.CONTROL_ELEMENT_UPDATE,
      payload: {
        controlId,
        elementId,
        data: structuredClone(data || {}),
        replace: replace === true,
      },
      partitions: [],
    });
  },

  async createControlElement({
    controlId,
    elementId,
    data,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const nextElementId = elementId || shared.createId();
    const control = context.state?.controls?.items?.[controlId];
    const resolvedIndex = shared.resolveLayoutElementIndex({
      layout: control,
      parentId,
      position,
      positionTargetId,
      index,
    });

    const submitResult = await shared.submitCommandWithContext({
      context,
      scope: "controls",
      type: COMMAND_TYPES.CONTROL_ELEMENT_CREATE,
      payload: {
        controlId,
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

  async moveControlElement({
    controlId,
    elementId,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const control = context.state?.controls?.items?.[controlId];
    const resolvedIndex = shared.resolveLayoutElementIndex({
      layout: control,
      parentId,
      position,
      positionTargetId,
      index,
      movingId: elementId,
    });

    return shared.submitCommandWithContext({
      context,
      scope: "controls",
      type: COMMAND_TYPES.CONTROL_ELEMENT_MOVE,
      payload: {
        controlId,
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

  async deleteControlElement({ controlId, elementIds }) {
    const context = await shared.ensureCommandContext();

    return shared.submitCommandWithContext({
      context,
      scope: "controls",
      type: COMMAND_TYPES.CONTROL_ELEMENT_DELETE,
      payload: {
        controlId,
        elementIds: structuredClone(elementIds || []),
      },
      partitions: [],
    });
  },
});
