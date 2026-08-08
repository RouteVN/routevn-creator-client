import {
  COMMAND_TYPES,
  getTagScopePartitionResourceType,
} from "../../../../../internal/project/commands.js";

const COMMAND_CONFIG = Object.freeze({
  animations: {
    type: COMMAND_TYPES.ANIMATION_CREATE,
    idField: "animationId",
  },
  transforms: {
    type: COMMAND_TYPES.TRANSFORM_CREATE,
    idField: "transformId",
  },
});
const IMAGE_CONFIG = Object.freeze({
  type: COMMAND_TYPES.IMAGE_CREATE,
  idField: "imageId",
});

const invalid = (code, message, details) => ({
  valid: false,
  error: { code, message, details },
});

const assertDestinationFolder = ({ state, resourceType, parentId }) => {
  if (!parentId) {
    return invalid(
      "destination_required",
      `Choose a destination folder for ${resourceType}.`,
    );
  }
  if (state?.[resourceType]?.items?.[parentId]?.type !== "folder") {
    return invalid(
      "destination_changed",
      `The selected ${resourceType} destination folder no longer exists.`,
      { resourceType, parentId },
    );
  }
  return { valid: true };
};

const resolveDestination = ({
  state,
  resourceType,
  destination,
  legacyParentId,
}) => {
  let resolvedDestination = destination;
  if (!resolvedDestination && legacyParentId) {
    resolvedDestination = { mode: "existing", parentId: legacyParentId };
  }
  if (!resolvedDestination) {
    return invalid(
      "destination_required",
      `Choose a destination folder for ${resourceType}.`,
    );
  }
  if (resolvedDestination.mode === "existing") {
    const validation = assertDestinationFolder({
      state,
      resourceType,
      parentId: resolvedDestination.parentId,
    });
    if (validation.valid === false) return validation;
    return {
      valid: true,
      destination: {
        mode: "existing",
        parentId: resolvedDestination.parentId,
      },
    };
  }
  if (resolvedDestination.mode !== "create") {
    return invalid(
      "invalid_destination_mode",
      `Choose an existing or new destination folder for ${resourceType}.`,
    );
  }
  if (
    typeof resolvedDestination.name !== "string" ||
    resolvedDestination.name.trim().length === 0
  ) {
    return invalid(
      "destination_name_required",
      `Enter a name for the new ${resourceType} folder.`,
    );
  }
  if (
    typeof resolvedDestination.destinationId !== "string" ||
    resolvedDestination.destinationId.length === 0 ||
    typeof resolvedDestination.commandId !== "string" ||
    resolvedDestination.commandId.length === 0
  ) {
    return invalid(
      "invalid_destination",
      `The new ${resourceType} destination is invalid. Reload the package and try again.`,
    );
  }
  if (state?.[resourceType]?.items?.[resolvedDestination.destinationId]) {
    return invalid(
      "destination_changed",
      `The new ${resourceType} destination conflicts with an existing item. Reload the package and try again.`,
      {
        resourceType,
        destinationId: resolvedDestination.destinationId,
      },
    );
  }
  return {
    valid: true,
    destination: {
      mode: "create",
      name: resolvedDestination.name.trim(),
      parentId: resolvedDestination.destinationId,
      destinationId: resolvedDestination.destinationId,
      commandId: resolvedDestination.commandId,
    },
  };
};

const createPlacementTracker = ({ shared, context }) => {
  const nextIndexByDestination = new Map();
  return ({ resourceType, parentId }) => {
    const key = `${resourceType}:${parentId}`;
    let nextIndex = nextIndexByDestination.get(key);
    if (nextIndex === undefined) {
      nextIndex = shared.resolveResourceIndex({
        state: context.state,
        resourceType,
        parentId,
        position: "last",
      });
    }
    nextIndexByDestination.set(key, nextIndex + 1);
    return nextIndex;
  };
};

const createResourceCommand = ({
  shared,
  context,
  resourceType,
  commandType,
  idField,
  id,
  data,
  parentId,
  index,
  commandId,
}) => ({
  commandId,
  scope: "resources",
  basePartition: shared.resourceTypePartitionFor(
    context.projectId,
    resourceType,
  ),
  type: commandType,
  payload: {
    [idField]: id,
    data: structuredClone(data),
    ...shared.buildPlacementPayload({ parentId, index }),
  },
});

const addDestinationFolderCommand = ({
  commands,
  destination,
  shared,
  context,
  resourceType,
  config,
  nextPlacementIndex,
}) => {
  if (destination.mode !== "create") return;
  commands.push(
    createResourceCommand({
      shared,
      context,
      resourceType,
      commandType: config.type,
      idField: config.idField,
      id: destination.destinationId,
      data: { type: "folder", name: destination.name },
      parentId: undefined,
      index: nextPlacementIndex({ resourceType, parentId: undefined }),
      commandId: destination.commandId,
    }),
  );
};

export const createImportPackageCommandApi = (shared) => ({
  async commitResourceImportPackage({
    planId,
    projectId,
    repositoryRevision,
    resourceType,
    resourceDestination,
    imageDestination,
    resourceParentId,
    imageParentId,
    fileRecords = [],
    fileCommandIds = {},
    images = [],
    tags = [],
    resources = [],
    existingImageIds = [],
  } = {}) {
    const config = COMMAND_CONFIG[resourceType];
    if (!config) {
      return invalid(
        "unsupported_resource_type",
        "This resource type cannot be imported.",
      );
    }

    const context = await shared.ensureCommandContext();
    if (projectId !== undefined && context.projectId !== projectId) {
      return invalid(
        "project_changed",
        "The project changed while the import was open. Review the import again.",
        { planId },
      );
    }
    if (
      repositoryRevision !== undefined &&
      context.repository.getRevision() !== repositoryRevision
    ) {
      return invalid(
        "project_changed",
        "The project changed while the import was open. Review the import again.",
        { planId },
      );
    }

    const resolvedResourceDestination = resolveDestination({
      state: context.state,
      resourceType,
      destination: resourceDestination,
      legacyParentId: resourceParentId,
    });
    if (resolvedResourceDestination.valid === false) {
      return resolvedResourceDestination;
    }

    let resolvedImageDestination;
    if (images.length > 0) {
      resolvedImageDestination = resolveDestination({
        state: context.state,
        resourceType: "images",
        destination: imageDestination,
        legacyParentId: imageParentId,
      });
      if (resolvedImageDestination.valid === false) {
        return resolvedImageDestination;
      }
    }

    for (const imageId of existingImageIds) {
      if (context.state?.images?.items?.[imageId]?.type !== "image") {
        return invalid(
          "substitution_changed",
          "A selected replacement image no longer exists.",
          { imageId },
        );
      }
    }

    for (const tag of tags) {
      if (
        tag.mode === "existing" &&
        context.state?.tags?.[tag.scopeKey]?.items?.[tag.destinationId]
          ?.type !== "tag"
      ) {
        return invalid("tag_changed", "A reused tag no longer exists.", {
          tagId: tag.destinationId,
        });
      }
    }

    const commands = shared.buildMissingFileCommands({
      context,
      fileRecords,
    });
    for (const command of commands) {
      command.commandId = fileCommandIds[command.payload.fileId];
    }
    const nextPlacementIndex = createPlacementTracker({ shared, context });
    addDestinationFolderCommand({
      commands,
      destination: resolvedResourceDestination.destination,
      shared,
      context,
      resourceType,
      config,
      nextPlacementIndex,
    });
    if (resolvedImageDestination) {
      addDestinationFolderCommand({
        commands,
        destination: resolvedImageDestination.destination,
        shared,
        context,
        resourceType: "images",
        config: IMAGE_CONFIG,
        nextPlacementIndex,
      });
    }
    for (const tag of tags) {
      if (tag.mode !== "create") continue;
      const tagResourceType = getTagScopePartitionResourceType(tag.scopeKey);
      if (!tagResourceType) {
        return invalid("unsupported_tag_scope", "Unsupported tag scope.");
      }
      commands.push({
        commandId: tag.commandId,
        scope: "resources",
        basePartition: shared.resourceTypePartitionFor(
          context.projectId,
          tagResourceType,
        ),
        type: COMMAND_TYPES.TAG_CREATE,
        payload: {
          scopeKey: tag.scopeKey,
          tagId: tag.destinationId,
          data: structuredClone(tag.data),
        },
      });
    }

    const resourceDestinationId =
      resolvedResourceDestination.destination.parentId;
    const imageDestinationId = resolvedImageDestination?.destination.parentId;
    for (const image of images) {
      commands.push(
        createResourceCommand({
          shared,
          context,
          resourceType: "images",
          commandType: COMMAND_TYPES.IMAGE_CREATE,
          idField: "imageId",
          id: image.destinationId,
          data: image.data,
          parentId: imageDestinationId,
          index: nextPlacementIndex({
            resourceType: "images",
            parentId: imageDestinationId,
          }),
          commandId: image.commandId,
        }),
      );
    }
    for (const resource of resources) {
      commands.push(
        createResourceCommand({
          shared,
          context,
          resourceType,
          commandType: config.type,
          idField: config.idField,
          id: resource.destinationId,
          data: resource.data,
          parentId: resourceDestinationId,
          index: nextPlacementIndex({
            resourceType,
            parentId: resourceDestinationId,
          }),
          commandId: resource.commandId,
        }),
      );
    }

    const result = await shared.submitCommandsWithContext({
      context,
      commands,
    });
    if (result?.valid === false) return result;

    return {
      valid: true,
      planId,
      commandIds: result.commandIds,
      resourceIds: resources.map((resource) => resource.destinationId),
      imageIds: images.map((image) => image.destinationId),
      reusedImageIds: [...existingImageIds],
      createdFolderIds: [
        resolvedResourceDestination.destination,
        resolvedImageDestination?.destination,
      ]
        .filter((destination) => destination?.mode === "create")
        .map((destination) => destination.destinationId),
      createdTagIds: tags
        .filter((tag) => tag.mode === "create")
        .map((tag) => tag.destinationId),
      reusedTagIds: tags
        .filter((tag) => tag.mode === "existing")
        .map((tag) => tag.destinationId),
    };
  },
});
