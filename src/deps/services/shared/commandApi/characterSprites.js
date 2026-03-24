import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

export const createCharacterSpriteCommandApi = (shared) => ({
  async createCharacterSpriteItem({
    characterId,
    spriteId,
    data,
    fileRecords = [],
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const ensureFilesResult = await shared.ensureFilesExist({
      context,
      fileRecords,
    });
    if (ensureFilesResult?.valid === false) {
      return ensureFilesResult;
    }

    const nextSpriteId = spriteId || shared.createId();
    const character = context.state?.characters?.items?.[characterId];
    const resolvedIndex = shared.resolveCharacterSpriteIndex({
      character,
      parentId,
      position,
      positionTargetId,
      index,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "characters",
    );

    const submitResult = await shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CHARACTER_SPRITE_CREATE,
      payload: {
        characterId,
        spriteId: nextSpriteId,
        data: structuredClone(data || {}),
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

    return nextSpriteId;
  },

  async updateCharacterSpriteItem({
    characterId,
    spriteId,
    data,
    fileRecords = [],
  }) {
    const context = await shared.ensureCommandContext();
    const ensureFilesResult = await shared.ensureFilesExist({
      context,
      fileRecords,
    });
    if (ensureFilesResult?.valid === false) {
      return ensureFilesResult;
    }

    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "characters",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CHARACTER_SPRITE_UPDATE,
      payload: {
        characterId,
        spriteId,
        data: structuredClone(data || {}),
      },
    });
  },

  async moveCharacterSpriteItem({
    characterId,
    spriteId,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
    const character = context.state?.characters?.items?.[characterId];
    const resolvedIndex = shared.resolveCharacterSpriteIndex({
      character,
      parentId,
      position,
      positionTargetId,
      index,
      movingId: spriteId,
    });
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "characters",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CHARACTER_SPRITE_MOVE,
      payload: {
        characterId,
        spriteId,
        ...shared.buildPlacementPayload({
          parentId,
          index: resolvedIndex,
          position,
          positionTargetId,
        }),
      },
    });
  },

  async deleteCharacterSpriteItem({ characterId, spriteIds }) {
    const context = await shared.ensureCommandContext();
    const resourcePartition = shared.resourceTypePartitionFor(
      context.projectId,
      "characters",
    );

    return shared.submitCommandWithContext({
      context,
      scope: "resources",
      basePartition: resourcePartition,
      type: COMMAND_TYPES.CHARACTER_SPRITE_DELETE,
      payload: {
        characterId,
        spriteIds: structuredClone(spriteIds || []),
      },
    });
  },
});
