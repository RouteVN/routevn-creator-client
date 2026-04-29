import { toFlatItems } from "./project/tree.js";

const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};

export const buildCharacterSpritePreviewFileIds = ({
  spritesCollection,
  spriteIds,
} = {}) => {
  const spriteItemsById = Object.fromEntries(
    toFlatItems(spritesCollection ?? EMPTY_COLLECTION)
      .filter((item) => item.type === "image")
      .map((item) => [item.id, item]),
  );

  return (Array.isArray(spriteIds) ? spriteIds : [])
    .map((spriteId) => spriteItemsById[spriteId]?.fileId)
    .filter(Boolean);
};
