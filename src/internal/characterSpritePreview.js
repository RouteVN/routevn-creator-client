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

export const buildDialogueSpritePreviewLayers = ({
  characters,
  characterId,
  spriteItems,
} = {}) => {
  const spriteIds = (Array.isArray(spriteItems) ? spriteItems : [])
    .map((item) => item?.resourceId)
    .filter(Boolean);
  if (spriteIds.length === 0) {
    return [];
  }

  const charactersById = characters?.items ?? {};
  const selectedCharacter = charactersById[characterId];
  const candidates = [
    selectedCharacter,
    ...Object.values(charactersById).filter(
      (character) => character !== selectedCharacter,
    ),
  ].filter(Boolean);

  for (const character of candidates) {
    const layers = buildCharacterSpritePreviewLayers({
      spritesCollection: character.sprites,
      spriteIds,
    });
    if (layers.length === spriteIds.length) {
      return layers;
    }
  }

  return [];
};
