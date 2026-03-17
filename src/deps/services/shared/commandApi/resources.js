import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

const RESOURCE_COMMAND_CONFIG = Object.freeze({
  images: {
    family: "image",
    idField: "imageId",
    deleteField: "imageIds",
  },
  sounds: {
    family: "sound",
    idField: "soundId",
    deleteField: "soundIds",
  },
  videos: {
    family: "video",
    idField: "videoId",
    deleteField: "videoIds",
  },
  tweens: {
    family: "animation",
    idField: "animationId",
    deleteField: "animationIds",
  },
  animations: {
    family: "animation",
    idField: "animationId",
    deleteField: "animationIds",
  },
  characters: {
    family: "character",
    idField: "characterId",
    deleteField: "characterIds",
  },
  fonts: {
    family: "font",
    idField: "fontId",
    deleteField: "fontIds",
  },
  transforms: {
    family: "transform",
    idField: "transformId",
    deleteField: "transformIds",
  },
  colors: {
    family: "color",
    idField: "colorId",
    deleteField: "colorIds",
  },
  typography: {
    family: "textStyle",
    idField: "textStyleId",
    deleteField: "textStyleIds",
  },
  textStyles: {
    family: "textStyle",
    idField: "textStyleId",
    deleteField: "textStyleIds",
  },
  variables: {
    family: "variable",
    idField: "variableId",
    deleteField: "variableIds",
  },
  layouts: {
    family: "layout",
    idField: "layoutId",
    deleteField: "layoutIds",
  },
});

const getResourceCommandConfig = (resourceType) => {
  const config = RESOURCE_COMMAND_CONFIG[resourceType];
  if (config) {
    return config;
  }

  throw new Error(`Unsupported resourceType: ${resourceType}`);
};

export const createResourceCommandApi = (shared) => ({
  async createResourceItem({
    resourceType,
    resourceId,
    data,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const nextResourceId = resourceId || shared.createId();
    const { family, idField } = getResourceCommandConfig(resourceType);
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType,
      parentId,
      position,
      positionTargetId,
      index,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    const submitResult = await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES[`${family.toUpperCase()}_CREATE`],
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
  },

  async updateResourceItem({ resourceType, resourceId, data }) {
    const context = await shared.ensureCommandContext();
    const { family, idField } = getResourceCommandConfig(resourceType);
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES[`${family.toUpperCase()}_UPDATE`],
      payload: {
        [idField]: resourceId,
        data: structuredClone(data || {}),
      },
      partitions: [],
    });
  },

  async moveResourceItem({
    resourceType,
    resourceId,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const { family, idField } = getResourceCommandConfig(resourceType);
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType,
      parentId,
      position,
      positionTargetId,
      index,
      movingId: resourceId,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES[`${family.toUpperCase()}_MOVE`],
      payload: {
        [idField]: resourceId,
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

  async deleteResourceItem({ resourceType, resourceIds }) {
    const context = await shared.ensureCommandContext();
    const { family, deleteField } = getResourceCommandConfig(resourceType);
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES[`${family.toUpperCase()}_DELETE`],
      payload: {
        [deleteField]: structuredClone(resourceIds || []),
      },
      partitions: [],
    });
  },
});
