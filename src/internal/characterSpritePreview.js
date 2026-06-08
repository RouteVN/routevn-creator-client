import { toFlatItems } from "./project/tree.js";

const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};

export const isCharacterSpriteResourceItem = (item) =>
  item?.type === "image" || item?.type === "spritesheet";

export const buildCharacterSpritePreviewFileIds = ({
  spritesCollection,
  spriteIds,
} = {}) => {
  const spriteItemsById = Object.fromEntries(
    toFlatItems(spritesCollection ?? EMPTY_COLLECTION)
      .filter(isCharacterSpriteResourceItem)
      .map((item) => [item.id, item]),
  );

  return (Array.isArray(spriteIds) ? spriteIds : [])
    .map((spriteId) => spriteItemsById[spriteId]?.fileId)
    .filter(Boolean);
};
