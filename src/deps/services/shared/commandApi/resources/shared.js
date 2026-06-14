const createResourcePartition = ({ shared, context, resourceType }) => {
  return shared.resourceTypePartitionFor(context.projectId, resourceType);
};

const isNonRootParentId = (parentId) => {
  return typeof parentId === "string" && parentId.length > 0;
};

const validateCreateResourceParent = ({
  context,
  resourceType,
  data,
  parentId,
} = {}) => {
  if (resourceType !== "variables") {
    return { valid: true };
  }

  const parent = context?.state?.variables?.items?.[parentId];
  const isFolderParent = parent?.type === "folder";

  if (data?.type === "folder") {
    return !isNonRootParentId(parentId) || isFolderParent
      ? { valid: true }
      : {
          valid: false,
          error: {
            code: "precondition_validation_failed",
            message: "payload.parentId must reference a folder variable item",
          },
        };
  }

  return isFolderParent
    ? { valid: true }
    : {
        valid: false,
        error: {
          code: "precondition_validation_failed",
          message: "payload.parentId must reference a folder variable item",
        },
      };
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
  fileRecords = [],
}) => {
  const context = await shared.ensureCommandContext();
  const parentValidation = validateCreateResourceParent({
    context,
    resourceType,
    data,
    parentId,
  });
  if (parentValidation?.valid === false) {
    return parentValidation;
  }

  const nextResourceId = idValue ?? shared.createId();
  const resolvedIndex = shared.resolveResourceIndex({
    state: context.state,
    resourceType,
    parentId,
    position,
    positionTargetId,
    index,
  });
  const ensureFilesResult = await shared.ensureFilesExist({
    context,
    fileRecords,
  });
  if (ensureFilesResult?.valid === false) {
    return ensureFilesResult;
  }

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
  fileRecords = [],
}) => {
  const context = await shared.ensureCommandContext();
  const ensureFilesResult = await shared.ensureFilesExist({
    context,
    fileRecords,
  });
  if (ensureFilesResult?.valid === false) {
    return ensureFilesResult;
  }

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
  });
};
