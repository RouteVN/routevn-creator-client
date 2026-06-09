import { toFlatItems } from "./project/tree.js";

const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};

export const isCharacterSpriteResourceItem = (item) =>
  item?.type === "image" || item?.type === "spritesheet";

const getFirstSpritesheetAnimationEntry = (item = {}) => {
  const entries = Object.entries(item.animations ?? {});
  return entries[0] ?? [];
};

export const buildCharacterSpritePreviewLayer = (item) => {
  if (!isCharacterSpriteResourceItem(item) || !item.fileId) {
    return undefined;
  }

  if (item.type === "spritesheet") {
    const [animationName, animation] = getFirstSpritesheetAnimationEntry(item);
    return {
      kind: "spritesheet",
      itemId: item.id,
      fileId: item.fileId,
      atlas: item.jsonData,
      animation,
      animationName,
      previewKey: [
        "spritesheet",
        item.id,
        item.fileId,
        animationName,
        animation?.frames?.join(","),
        animation?.fps ?? animation?.animationSpeed,
      ].join(":"),
    };
  }

  return {
    kind: "image",
    itemId: item.id,
    fileId: item.fileId,
    previewKey: ["image", item.id, item.fileId].join(":"),
  };
};

export const buildCharacterSpritePreviewLayers = ({
  spritesCollection,
  spriteIds,
} = {}) => {
  const spriteItemsById = Object.fromEntries(
    toFlatItems(spritesCollection ?? EMPTY_COLLECTION)
      .filter(isCharacterSpriteResourceItem)
      .map((item) => [item.id, item]),
  );

  return (Array.isArray(spriteIds) ? spriteIds : [])
    .map((spriteId) =>
      buildCharacterSpritePreviewLayer(spriteItemsById[spriteId]),
    )
    .filter(Boolean);
};

export const buildCharacterSpritePreviewFileIds = ({
  spritesCollection,
  spriteIds,
} = {}) => {
  return buildCharacterSpritePreviewLayers({
    spritesCollection,
    spriteIds,
  }).map((layer) => layer.fileId);
};
