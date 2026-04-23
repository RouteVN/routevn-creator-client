import {
  COMMAND_TYPES,
  getTagScopePartitionResourceType,
} from "../../../../../internal/project/commands.js";
import {
  submitCreateResourceCommand,
  submitDeleteResourceCommand,
  submitMoveResourceCommand,
  submitUpdateResourceCommand,
} from "./shared.js";

export const createMediaResourceCommandApi = (shared) => ({
  async createTag({ scopeKey, tagId, data }) {
    const context = await shared.ensureCommandContext();
    const resourceType = getTagScopePartitionResourceType(scopeKey);

    if (!resourceType) {
      return {
        valid: false,
        error: {
          message: "Unsupported tag scope.",
        },
      };
    }

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: shared.resourceTypePartitionFor(
        context.projectId,
        resourceType,
      ),
      type: COMMAND_TYPES.TAG_CREATE,
      payload: {
        scopeKey,
        tagId: tagId ?? shared.createId(),
        data: structuredClone(data),
      },
    });
  },
  async updateTag({ scopeKey, tagId, data }) {
    const context = await shared.ensureCommandContext();
    const resourceType = getTagScopePartitionResourceType(scopeKey);

    if (!resourceType) {
      return {
        valid: false,
        error: {
          message: "Unsupported tag scope.",
        },
      };
    }

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: shared.resourceTypePartitionFor(
        context.projectId,
        resourceType,
      ),
      type: COMMAND_TYPES.TAG_UPDATE,
      payload: {
        scopeKey,
        tagId,
        data: structuredClone(data),
      },
    });
  },
  async deleteTags({ scopeKey, tagIds }) {
    const context = await shared.ensureCommandContext();
    const resourceType = getTagScopePartitionResourceType(scopeKey);

    if (!resourceType) {
      return {
        valid: false,
        error: {
          message: "Unsupported tag scope.",
        },
      };
    }

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: shared.resourceTypePartitionFor(
        context.projectId,
        resourceType,
      ),
      type: COMMAND_TYPES.TAG_DELETE,
      payload: {
        scopeKey,
        tagIds: structuredClone(tagIds ?? []),
      },
    });
  },
  createImage: async ({
    imageId,
    data,
    fileRecords,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitCreateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_CREATE,
      idField: "imageId",
      idValue: imageId,
      data,
      fileRecords,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateImage: async ({ imageId, data, fileRecords }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_UPDATE,
      idField: "imageId",
      idValue: imageId,
      data,
      fileRecords,
    }),
  moveImage: async ({
    imageId,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitMoveResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_MOVE,
      idField: "imageId",
      idValue: imageId,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  deleteImages: async ({ imageIds }) =>
    submitDeleteResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_DELETE,
      deleteField: "imageIds",
      ids: imageIds,
    }),
  createSpritesheet: async ({
    spritesheetId,
    data,
    fileRecords,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitCreateResourceCommand({
      shared,
      resourceType: "spritesheets",
      type: COMMAND_TYPES.SPRITESHEET_CREATE,
      idField: "spritesheetId",
      idValue: spritesheetId,
      data,
      fileRecords,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateSpritesheet: async ({ spritesheetId, data, fileRecords }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "spritesheets",
      type: COMMAND_TYPES.SPRITESHEET_UPDATE,
      idField: "spritesheetId",
      idValue: spritesheetId,
      data,
      fileRecords,
    }),
  moveSpritesheet: async ({
    spritesheetId,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitMoveResourceCommand({
      shared,
      resourceType: "spritesheets",
      type: COMMAND_TYPES.SPRITESHEET_MOVE,
      idField: "spritesheetId",
      idValue: spritesheetId,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  deleteSpritesheets: async ({ spritesheetIds }) =>
    submitDeleteResourceCommand({
      shared,
      resourceType: "spritesheets",
      type: COMMAND_TYPES.SPRITESHEET_DELETE,
      deleteField: "spritesheetIds",
      ids: spritesheetIds,
    }),
  createSound: async ({
    soundId,
    data,
    fileRecords,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitCreateResourceCommand({
      shared,
      resourceType: "sounds",
      type: COMMAND_TYPES.SOUND_CREATE,
      idField: "soundId",
      idValue: soundId,
      data,
      fileRecords,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateSound: async ({ soundId, data, fileRecords }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "sounds",
      type: COMMAND_TYPES.SOUND_UPDATE,
      idField: "soundId",
      idValue: soundId,
      data,
      fileRecords,
    }),
  moveSound: async ({
    soundId,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitMoveResourceCommand({
      shared,
      resourceType: "sounds",
      type: COMMAND_TYPES.SOUND_MOVE,
      idField: "soundId",
      idValue: soundId,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  deleteSounds: async ({ soundIds }) =>
    submitDeleteResourceCommand({
      shared,
      resourceType: "sounds",
      type: COMMAND_TYPES.SOUND_DELETE,
      deleteField: "soundIds",
      ids: soundIds,
    }),
  createVideo: async ({
    videoId,
    data,
    fileRecords,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitCreateResourceCommand({
      shared,
      resourceType: "videos",
      type: COMMAND_TYPES.VIDEO_CREATE,
      idField: "videoId",
      idValue: videoId,
      data,
      fileRecords,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateVideo: async ({ videoId, data, fileRecords }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "videos",
      type: COMMAND_TYPES.VIDEO_UPDATE,
      idField: "videoId",
      idValue: videoId,
      data,
      fileRecords,
    }),
  moveVideo: async ({
    videoId,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitMoveResourceCommand({
      shared,
      resourceType: "videos",
      type: COMMAND_TYPES.VIDEO_MOVE,
      idField: "videoId",
      idValue: videoId,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  deleteVideos: async ({ videoIds }) =>
    submitDeleteResourceCommand({
      shared,
      resourceType: "videos",
      type: COMMAND_TYPES.VIDEO_DELETE,
      deleteField: "videoIds",
      ids: videoIds,
    }),
  createFont: async ({
    fontId,
    data,
    fileRecords,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitCreateResourceCommand({
      shared,
      resourceType: "fonts",
      type: COMMAND_TYPES.FONT_CREATE,
      idField: "fontId",
      idValue: fontId,
      data,
      fileRecords,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateFont: async ({ fontId, data, fileRecords }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "fonts",
      type: COMMAND_TYPES.FONT_UPDATE,
      idField: "fontId",
      idValue: fontId,
      data,
      fileRecords,
    }),
  moveFont: async ({
    fontId,
    parentId,
    position = "last",
    positionTargetId,
    index,
  }) =>
    submitMoveResourceCommand({
      shared,
      resourceType: "fonts",
      type: COMMAND_TYPES.FONT_MOVE,
      idField: "fontId",
      idValue: fontId,
      parentId,
      position,
      positionTargetId,
      index,
    }),
  deleteFonts: async ({ fontIds }) =>
    submitDeleteResourceCommand({
      shared,
      resourceType: "fonts",
      type: COMMAND_TYPES.FONT_DELETE,
      deleteField: "fontIds",
      ids: fontIds,
    }),
});
