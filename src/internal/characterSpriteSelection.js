import { toFlatItems } from "./project/tree.js";
import { isCharacterSpriteResourceItem } from "./characterSpritePreview.js";

// A character's sprites are picked one per sprite group, such as a body and a
// face, and drawn in the groups' order, the first at the bottom. A character
// without sprite groups has one group.
export const DEFAULT_SPRITE_GROUP_ID = "base";
const DEFAULT_SPRITE_GROUP_NAME = "Sprite";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const resolveSpriteGroupId = (spriteGroup = {}, index = 0) => {
  if (typeof spriteGroup.id === "string" && spriteGroup.id.length > 0) {
    return spriteGroup.id;
  }

  return `legacy-sprite-group-${index + 1}`;
};

const resolveSpriteGroupName = (spriteGroup = {}, index = 0) => {
  if (typeof spriteGroup.name === "string" && spriteGroup.name.length > 0) {
    return spriteGroup.name;
  }

  return `Group ${index + 1}`;
};

export const buildSpriteSelectionGroups = (character = {}) => {
  if (
    !Array.isArray(character?.spriteGroups) ||
    character.spriteGroups.length === 0
  ) {
    return [
      {
        id: DEFAULT_SPRITE_GROUP_ID,
        name: DEFAULT_SPRITE_GROUP_NAME,
        tags: [],
      },
    ];
  }

  return character.spriteGroups.map((spriteGroup, index) => ({
    id: resolveSpriteGroupId(spriteGroup, index),
    name: resolveSpriteGroupName(spriteGroup, index),
    tags: Array.isArray(spriteGroup?.tags) ? spriteGroup.tags : [],
  }));
};

// Pickers list the groups top first, the reverse of the drawing order.
export const orderSpriteSelectionGroupsTopFirst = (
  spriteSelectionGroups = [],
) => spriteSelectionGroups.slice().reverse();

// A sprite belongs to a group with tags when it has one of them; a group
// without tags takes any sprite.
export const matchesSpriteGroupTags = ({ item, tagIds } = {}) => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    return true;
  }

  const itemTagIds = Array.isArray(item?.tagIds) ? item.tagIds : [];
  return tagIds.some((tagId) => itemTagIds.includes(tagId));
};

const findFirstSpriteIdForGroup = ({
  group,
  spritesCollection,
  allowUntaggedGroupFallback = false,
} = {}) => {
  const hasTags = Array.isArray(group?.tags) && group.tags.length > 0;
  if (!hasTags && !allowUntaggedGroupFallback) {
    return undefined;
  }

  return toFlatItems(spritesCollection ?? createEmptyCollection()).find(
    (item) =>
      isCharacterSpriteResourceItem(item) &&
      matchesSpriteGroupTags({
        item,
        tagIds: group?.tags,
      }),
  )?.id;
};

// The sprites a newly picked character starts with: the first matching
// sprite of each group with tags, and of the first group without tags.
export const buildDefaultCharacterSprites = ({ characterData } = {}) => {
  const spriteSelectionGroups = buildSpriteSelectionGroups(characterData);
  const sprites = [];
  let hasUntaggedGroupFallback = false;

  for (const spriteSelectionGroup of spriteSelectionGroups) {
    const hasTags =
      Array.isArray(spriteSelectionGroup.tags) &&
      spriteSelectionGroup.tags.length > 0;
    const resourceId = findFirstSpriteIdForGroup({
      group: spriteSelectionGroup,
      spritesCollection: characterData?.sprites,
      allowUntaggedGroupFallback: hasTags || !hasUntaggedGroupFallback,
    });

    if (!resourceId) {
      continue;
    }

    sprites.push({
      id: spriteSelectionGroup.id,
      resourceId,
    });

    if (!hasTags) {
      hasUntaggedGroupFallback = true;
    }
  }

  return sprites;
};

// The saved { id, resourceId } list of picked sprites, in drawing order.
export const buildCharacterSpritesFromGroups = ({
  spriteSelectionGroups = [],
  spriteIdsByGroup = {},
} = {}) => {
  const sprites = [];
  for (const spriteSelectionGroup of spriteSelectionGroups) {
    const resourceId = spriteIdsByGroup[spriteSelectionGroup.id];
    if (resourceId) {
      sprites.push({ id: spriteSelectionGroup.id, resourceId });
    }
  }
  return sprites;
};

export const buildSpriteIdsByGroup = (sprites = []) => {
  const spriteIdsByGroup = {};
  for (const sprite of sprites) {
    spriteIdsByGroup[sprite.id] = sprite.resourceId;
  }
  return spriteIdsByGroup;
};
