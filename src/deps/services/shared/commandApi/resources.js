import { normalizeParentId } from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

const RESOURCE_TYPE_TO_COMMAND_FAMILY = Object.freeze({
  images: "image",
  sounds: "sound",
  videos: "video",
  tweens: "animation",
  animations: "animation",
  characters: "character",
  fonts: "font",
  transforms: "transform",
  colors: "color",
  typography: "textStyle",
  textStyles: "textStyle",
  variables: "variable",
  layouts: "layout",
});

const COMMAND_FAMILY_TO_ID_FIELD = Object.freeze({
  image: "imageId",
  sound: "soundId",
  video: "videoId",
  animation: "animationId",
  character: "characterId",
  font: "fontId",
  transform: "transformId",
  color: "colorId",
  textStyle: "textStyleId",
  variable: "variableId",
  layout: "layoutId",
});

const COMMAND_FAMILY_TO_DELETE_FIELD = Object.freeze({
  image: "imageIds",
  sound: "soundIds",
  video: "videoIds",
  animation: "animationIds",
  character: "characterIds",
  font: "fontIds",
  transform: "transformIds",
  color: "colorIds",
  textStyle: "textStyleIds",
  variable: "variableIds",
  layout: "layoutIds",
});

const resolveCommandFamily = (resourceType) => {
  const family = RESOURCE_TYPE_TO_COMMAND_FAMILY[resourceType];
  if (family) {
    return family;
  }

  throw new Error(`Unsupported resourceType: ${resourceType}`);
};

const buildPlacementPayload = ({
  parentId = null,
  index,
  position = "last",
  positionTargetId,
} = {}) => ({
  parentId: normalizeParentId(parentId),
  ...(index !== undefined
    ? { index }
    : {
        position,
        ...(positionTargetId !== undefined ? { positionTargetId } : {}),
      }),
});

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
    const family = resolveCommandFamily(resourceType);
    const idField = COMMAND_FAMILY_TO_ID_FIELD[family];
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
        ...buildPlacementPayload({
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

  async updateResourceItem({ resourceType, resourceId, data, patch }) {
    const context = await shared.ensureCommandContext();
    const family = resolveCommandFamily(resourceType);
    const idField = COMMAND_FAMILY_TO_ID_FIELD[family];
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
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const family = resolveCommandFamily(resourceType);
    const idField = COMMAND_FAMILY_TO_ID_FIELD[family];
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
        ...buildPlacementPayload({
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
    const family = resolveCommandFamily(resourceType);
    const deleteField = COMMAND_FAMILY_TO_DELETE_FIELD[family];
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

  async duplicateResourceItem({
    resourceType,
    sourceId,
    newId,
    parentId,
    position,
    positionTargetId,
    index,
    name,
  }) {
    const context = await shared.ensureCommandContext();
    const collection = context.state?.[resourceType];
    const sourceItem = collection?.items?.[sourceId];
    const resolvedParentId = normalizeParentId(
      parentId ?? sourceItem?.parentId ?? null,
    );
    const resolvedPosition = position || "after";
    const resolvedPositionTargetId = positionTargetId || sourceId;
    const resolvedIndex = shared.resolveResourceIndex({
      state: context.state,
      resourceType,
      parentId: resolvedParentId,
      position: resolvedPosition,
      positionTargetId: resolvedPositionTargetId,
      index,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      resourceType,
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.RESOURCE_DUPLICATE,
      payload: {
        resourceType,
        sourceId,
        newId,
        ...buildPlacementPayload({
          parentId: resolvedParentId,
          index: resolvedIndex,
          position: resolvedPosition,
          positionTargetId: resolvedPositionTargetId,
        }),
        name: typeof name === "string" && name.length > 0 ? name : undefined,
      },
      partitions: [],
    });
  },
});
