import { COMMAND_TYPES } from "../../../../../internal/project/commands.js";
import {
  submitCreateResourceCommand,
  submitDeleteResourceCommand,
  submitMoveResourceCommand,
  submitUpdateResourceCommand,
} from "./shared.js";

export const createMediaResourceCommandApi = (shared) => ({
  createImage: async ({
    imageId,
    data,
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
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateImage: async ({ imageId, data }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "images",
      type: COMMAND_TYPES.IMAGE_UPDATE,
      idField: "imageId",
      idValue: imageId,
      data,
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
  createSound: async ({
    soundId,
    data,
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
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateSound: async ({ soundId, data }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "sounds",
      type: COMMAND_TYPES.SOUND_UPDATE,
      idField: "soundId",
      idValue: soundId,
      data,
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
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateVideo: async ({ videoId, data }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "videos",
      type: COMMAND_TYPES.VIDEO_UPDATE,
      idField: "videoId",
      idValue: videoId,
      data,
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
      parentId,
      position,
      positionTargetId,
      index,
    }),
  updateFont: async ({ fontId, data }) =>
    submitUpdateResourceCommand({
      shared,
      resourceType: "fonts",
      type: COMMAND_TYPES.FONT_UPDATE,
      idField: "fontId",
      idValue: fontId,
      data,
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
