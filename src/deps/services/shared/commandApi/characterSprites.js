import { normalizeParentId } from "../projectRepository.js";
import { COMMAND_TYPES } from "../../../../internal/project/commands.js";

const createPlacementPayload = ({
  parentId = null,
  index,
  position = "last",
  positionTargetId,
} = {}) => {
  const payload = {
    parentId: normalizeParentId(parentId),
  };

  if (index !== undefined) {
    payload.index = index;
    return payload;
  }

  payload.position = position;

  if (positionTargetId !== undefined) {
    payload.positionTargetId = positionTargetId;
  }

  return payload;
};

export const createCharacterSpriteCommandApi = (shared) => ({
  async createCharacterSpriteItem({
    characterId,
    spriteId,
    data,
    parentId = null,
    position = "last",
    positionTargetId,
    index,
  }) {
    const context = await shared.ensureCommandContext();
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
        ...createPlacementPayload({
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

    return nextSpriteId;
  },

  async updateCharacterSpriteItem({ characterId, spriteId, data, patch }) {
    const context = await shared.ensureCommandContext();
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
        data: structuredClone(data ?? patch ?? {}),
      },
      partitions: [],
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
        ...createPlacementPayload({
          parentId,
          index: resolvedIndex,
          position,
          positionTargetId,
        }),
      },
      partitions: [],
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
      partitions: [],
    });
  },
});
