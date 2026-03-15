import { normalizeParentId } from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createResourceCommandApi = (shared) => ({
  async createResourceItem({
    resourceType,
    resourceId,
    data,
    parentId = null,
    position = "last",
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const nextResourceId = resourceId || shared.createId();
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType,
      parentId,
      position,
      index,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_CREATE,
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

  async updateResourceItem({ resourceType, resourceId, data, patch }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_UPDATE,
      payload: {
        resourceType,
        resourceId,
        data: structuredClone(data ?? patch ?? {}),
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
    const context = await shared.ensureCommandContext();
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType,
      parentId,
      position,
      index,
      movingId: resourceId,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_MOVE,
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
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_DELETE,
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
    const context = await shared.ensureCommandContext();
    const collection = context.state?.[resourceType];
    const sourceItem = collection?.items?.[sourceId];
    const resolvedParentId = normalizeParentId(
      parentId ?? sourceItem?.parentId ?? null,
    );
    const resolvedPosition = position || { after: sourceId };
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType,
      parentId: resolvedParentId,
      position: resolvedPosition,
      index,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_DUPLICATE,
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
});
