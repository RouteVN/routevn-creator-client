import { filterTreeCollection, toFlatItems } from "./project/tree.js";
import { isCharacterSpriteResourceItem } from "./characterSpritePreview.js";

export const getImageSelectorResources = (
  repositoryState,
  resourceTarget = "images",
  characterId,
) => {
  if (resourceTarget === "images") {
    return repositoryState.images ?? { items: {}, tree: [] };
  }

  if (resourceTarget === "characters") {
    return filterTreeCollection(
      repositoryState.characters,
      (item) => item.type === "character",
    );
  }

  const collection = { items: {}, tree: [] };
  for (const character of toFlatItems(repositoryState.characters)) {
    if (character.type !== "character") continue;
    if (characterId && character.id !== characterId) continue;
    const sprites = filterTreeCollection(
      character.sprites,
      isCharacterSpriteResourceItem,
    );
    const folderId = `character:${character.id}`;
    collection.items[folderId] = {
      id: folderId,
      type: "folder",
      name: character.name,
    };
    Object.assign(collection.items, sprites.items);
    collection.tree.push({ id: folderId, children: sprites.tree });
  }
  return collection;
};
