import { normalizeParentId } from "../typedProjectRepository.js";

export const createResourceCommandApi = (shared) => ({
  async createResourceItem({
    resourceType,
    resourceId,
    data,
    parentId = null,
    position = "last",
    index,
  }) {
    const context = await shared.ensureTypedCommandContext();
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

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
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

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    await shared.submitTypedCommandWithContext({
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
    const context = await shared.ensureTypedCommandContext();
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

    await shared.submitTypedCommandWithContext({
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
});
