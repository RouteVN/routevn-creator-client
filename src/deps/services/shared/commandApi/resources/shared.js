const createResourcePartition = ({ shared, context, resourceType }) => {
  return shared.resourceTypePartitionFor(context.projectId, resourceType);
};

export const submitCreateResourceCommand = async ({
  shared,
  resourceType,
  type,
  idField,
  idValue,
  data,
  parentId,
  position = "last",
  positionTargetId,
  index,
}) => {
  const context = await shared.ensureCommandContext();
  const nextResourceId = idValue ?? shared.createId();
  const resolvedIndex = shared.resolveResourceIndex({
    state: context.state,
    resourceType,
    parentId,
    position,
    positionTargetId,
    index,
  });

  const submitResult = await shared.submitCommandWithContext({
    context,
    scope: "resources",
    basePartition: createResourcePartition({
      shared,
      context,
      resourceType,
    }),
    type,
    payload: {
      [idField]: nextResourceId,
      data: structuredClone(data),
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

  return nextResourceId;
};

export const submitUpdateResourceCommand = async ({
  shared,
  resourceType,
  type,
  idField,
  idValue,
  data,
}) => {
  const context = await shared.ensureCommandContext();

  return shared.submitCommandWithContext({
    context,
    scope: "resources",
    basePartition: createResourcePartition({
      shared,
      context,
      resourceType,
    }),
    type,
    payload: {
      [idField]: idValue,
      data: structuredClone(data),
    },
    partitions: [],
  });
};

export const submitMoveResourceCommand = async ({
  shared,
  resourceType,
  type,
  idField,
  idValue,
  parentId,
  position = "last",
  positionTargetId,
  index,
}) => {
  const context = await shared.ensureCommandContext();
  const resolvedIndex = shared.resolveResourceIndex({
    state: context.state,
    resourceType,
    parentId,
    position,
    positionTargetId,
    index,
    movingId: idValue,
  });

  return shared.submitCommandWithContext({
    context,
    scope: "resources",
    basePartition: createResourcePartition({
      shared,
      context,
      resourceType,
    }),
    type,
    payload: {
      [idField]: idValue,
      ...shared.buildPlacementPayload({
        parentId,
        index: resolvedIndex,
        position,
        positionTargetId,
      }),
    },
    partitions: [],
  });
};

export const submitDeleteResourceCommand = async ({
  shared,
  resourceType,
  type,
  deleteField,
  ids,
}) => {
  const context = await shared.ensureCommandContext();

  return shared.submitCommandWithContext({
    context,
    scope: "resources",
    basePartition: createResourcePartition({
      shared,
      context,
      resourceType,
    }),
    type,
    payload: {
      [deleteField]: structuredClone(ids ?? []),
    },
    partitions: [],
  });
};
