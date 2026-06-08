import { isCharacterSpriteResourceItem } from "./characterSpritePreview.js";
import { toFlatItems } from "./project/tree.js";

export const CHARACTER_SPRITES_DEBUG_SCOPE = "character-sprites";

const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};

const toActionItems = (items) => (Array.isArray(items) ? items : []);

const getCharactersById = (charactersCollection = {}) =>
  charactersCollection?.items ?? {};

const getSpriteItems = (spritesCollection = EMPTY_COLLECTION) =>
  toFlatItems(spritesCollection ?? EMPTY_COLLECTION).filter(
    isCharacterSpriteResourceItem,
  );

const summarizeSpriteResource = (item = {}) => ({
  id: item.id,
  type: item.type,
  name: item.name,
  fileId: item.fileId,
  thumbnailFileId: item.thumbnailFileId,
  tagIds: item.tagIds,
});

export const summarizeCharacterSpriteActionItems = (items = []) =>
  toActionItems(items).map((item) => ({
    id: item?.id,
    transformId: item?.transformId,
    spriteName: item?.spriteName,
    spriteCount: Array.isArray(item?.sprites) ? item.sprites.length : 0,
    sprites: Array.isArray(item?.sprites) ? item.sprites : [],
  }));

export const summarizeCharacterSpriteRepository = ({
  charactersCollection,
  characterIds,
} = {}) => {
  const charactersById = getCharactersById(charactersCollection);
  const ids =
    Array.isArray(characterIds) && characterIds.length > 0
      ? characterIds
      : Object.keys(charactersById);

  return ids.map((characterId) => {
    const character = charactersById[characterId];
    const sprites = getSpriteItems(character?.sprites);

    return {
      id: characterId,
      exists: Boolean(character),
      name: character?.name,
      spriteGroupCount: Array.isArray(character?.spriteGroups)
        ? character.spriteGroups.length
        : 0,
      spriteGroups: character?.spriteGroups,
      spriteCount: sprites.length,
      sprites: sprites.map(summarizeSpriteResource),
    };
  });
};

export const findCharacterItemsMissingSprites = (items = []) =>
  toActionItems(items).filter(
    (item) =>
      item?.id && (!Array.isArray(item?.sprites) || item.sprites.length === 0),
  );

const collectCharacterSpriteResourceIds = (items = []) => {
  const resourceIds = new Set();
  for (const item of toActionItems(items)) {
    for (const sprite of Array.isArray(item?.sprites) ? item.sprites : []) {
      if (typeof sprite?.resourceId === "string" && sprite.resourceId) {
        resourceIds.add(sprite.resourceId);
      }
    }
  }

  return [...resourceIds];
};

const getSelectedLine = ({ projectData, selection } = {}) => {
  const selectedSection =
    projectData?.story?.scenes?.[selection?.sceneId]?.sections?.[
      selection?.sectionId
    ];

  return selectedSection?.lines?.find((line) => line?.id === selection?.lineId);
};

export const summarizeCharacterSpriteProjectData = ({
  projectData,
  selection,
} = {}) => {
  const selectedLine = getSelectedLine({ projectData, selection });
  const characterItems = selectedLine?.actions?.character?.items ?? [];
  const resourceIds = collectCharacterSpriteResourceIds(characterItems);
  const images = projectData?.resources?.images ?? {};

  return {
    selection,
    hasSelectedLine: Boolean(selectedLine),
    characterActionItems: summarizeCharacterSpriteActionItems(characterItems),
    missingSpriteItems: summarizeCharacterSpriteActionItems(
      findCharacterItemsMissingSprites(characterItems),
    ),
    spriteResources: resourceIds.map((resourceId) => {
      const resource = images[resourceId];
      return {
        id: resourceId,
        existsInResourcesImages: Boolean(resource),
        fileId: resource?.fileId,
        width: resource?.width,
        height: resource?.height,
      };
    }),
  };
};

export const logCharacterSpritesDebug = (event, data = {}) => {
  console.debug(`[rvn.debug.${CHARACTER_SPRITES_DEBUG_SCOPE}]`, {
    event,
    ...data,
  });
};

export const warnCharacterSpritesDebug = (event, data = {}) => {
  console.warn(`[rvn.debug.${CHARACTER_SPRITES_DEBUG_SCOPE}]`, {
    event,
    ...data,
  });
};
