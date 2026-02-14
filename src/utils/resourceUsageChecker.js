// Keys that indicate resource usage in different resource types.
const SCENE_RESOURCE_KEYS = [
  "resourceId",
  "transformId",
  "sceneId",
  "sectionId",
  "characterId",
  "animation",
  "layoutId",
  "guiId",
  "bgmId",
  "sfxId",
  "variableId",
];

const LAYOUT_RESOURCE_KEYS = [
  "resourceId",
  "layoutId",
  "sceneId",
  "sectionId",
  "variableId",
  "imageId",
  "hoverImageId",
  "clickImageId",
  "thumbImageId",
  "barImageId",
  "hoverThumbImageId",
  "hoverBarImageId",
  "typographyId",
  "hoverTypographyId",
  "clickedTypographyId",
  "fontFileId",
];

const TYPOGRAPHY_RESOURCE_KEYS = ["colorId", "fontId"];

const EXPORT_RESOURCE_KEYS = new Set([
  ...SCENE_RESOURCE_KEYS,
  ...LAYOUT_RESOURCE_KEYS,
  ...TYPOGRAPHY_RESOURCE_KEYS,
]);

const RESOURCE_KEY_TO_TYPES = {
  resourceId: [
    "layouts",
    "images",
    "videos",
    "sounds",
    "tweens",
    "transforms",
    "characters",
    "typography",
    "colors",
    "fonts",
    "variables",
    "sprites",
  ],
  transformId: ["transforms"],
  characterId: ["characters"],
  animation: ["tweens"],
  layoutId: ["layouts"],
  bgmId: ["sounds"],
  sfxId: ["sounds"],
  variableId: ["variables"],
  imageId: ["images"],
  hoverImageId: ["images"],
  clickImageId: ["images"],
  thumbImageId: ["images"],
  barImageId: ["images"],
  hoverThumbImageId: ["images"],
  hoverBarImageId: ["images"],
  typographyId: ["typography"],
  hoverTypographyId: ["typography"],
  clickedTypographyId: ["typography"],
  colorId: ["colors"],
  fontId: ["fonts"],
  fontFileId: ["fonts"],
};

const COLLECTION_DEFS = {
  images: { collection: "images", itemType: "image" },
  videos: { collection: "videos", itemType: "video" },
  sounds: { collection: "sounds", itemType: "sound" },
  tweens: { collection: "tweens", itemType: "tween" },
  transforms: { collection: "transforms", itemType: "transform" },
  characters: { collection: "characters", itemType: "character" },
  fonts: { collection: "fonts", itemType: "font" },
  colors: { collection: "colors", itemType: "color" },
  typography: { collection: "typography", itemType: "typography" },
  layouts: { collection: "layouts", itemType: "layout" },
  variables: { collection: "variables", itemType: null },
  sprites: { collection: null, itemType: "sprite" },
};

// Mapping from resource names to their keys.
const RESOURCE_KEYS_MAP = {
  scenes: SCENE_RESOURCE_KEYS,
  layouts: LAYOUT_RESOURCE_KEYS,
  typography: TYPOGRAPHY_RESOURCE_KEYS,
};

const createUsageBuckets = () =>
  Object.keys(COLLECTION_DEFS).reduce((acc, key) => {
    acc[key] = new Set();
    return acc;
  }, {});

const getCollectionItems = (state, collectionName) => {
  return state?.[collectionName]?.items || {};
};

const toSetMap = () =>
  Object.keys(COLLECTION_DEFS).reduce((acc, key) => {
    acc[key] = new Set();
    return acc;
  }, {});

const addTypeIndex = (map, id, type) => {
  if (!id) return;
  if (!map.has(id)) {
    map.set(id, new Set());
  }
  map.get(id).add(type);
};

const createResourceIndex = (state) => {
  const byId = new Map();
  const byType = toSetMap();
  const spriteOwnerById = new Map();
  const spriteFileById = new Map();

  for (const [resourceType, def] of Object.entries(COLLECTION_DEFS)) {
    if (!def.collection || resourceType === "sprites") continue;
    const items = getCollectionItems(state, def.collection);

    for (const [id, item] of Object.entries(items)) {
      if (!item) continue;

      if (resourceType === "variables") {
        if (item.type === "folder") continue;
        byType.variables.add(id);
        addTypeIndex(byId, id, "variables");
        continue;
      }

      if (item.type !== def.itemType) continue;
      byType[resourceType].add(id);
      addTypeIndex(byId, id, resourceType);
    }
  }

  const characterItems = getCollectionItems(state, "characters");
  for (const [characterId, character] of Object.entries(characterItems)) {
    if (!character || character.type !== "character") continue;
    const sprites = character.sprites?.items || {};
    for (const [spriteId, sprite] of Object.entries(sprites)) {
      byType.sprites.add(spriteId);
      addTypeIndex(byId, spriteId, "sprites");
      spriteOwnerById.set(spriteId, characterId);
      if (sprite?.fileId) {
        spriteFileById.set(spriteId, sprite.fileId);
      }
    }
  }

  return {
    byId,
    byType,
    spriteOwnerById,
    spriteFileById,
  };
};

const scanNodeForResourceReferences = (node, onReference) => {
  if (!node || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && EXPORT_RESOURCE_KEYS.has(key)) {
      onReference({ key, value });
    }

    if (value && typeof value === "object") {
      scanNodeForResourceReferences(value, onReference);
    }
  }
};

const checkNode = (node, resourceId, keys, usages) => {
  if (!node || typeof node !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (
      typeof value === "string" &&
      value === resourceId &&
      keys.includes(key)
    ) {
      usages.push({
        property: key,
      });
    }

    if (typeof value === "object" && value !== null) {
      checkNode(value, resourceId, keys, usages);
    }
  }
};

const filterCollectionItemsByIds = (collectionState, ids) => {
  if (!collectionState) return collectionState;
  const items = collectionState.items || {};
  const filteredItems = {};

  for (const id of ids) {
    const item = items[id];
    if (item) {
      filteredItems[id] = item;
    }
  }

  return {
    ...collectionState,
    items: filteredItems,
  };
};

export const recursivelyCheckResource = ({ state, itemId, checkTargets }) => {
  const inProps = {};

  for (const targetName of checkTargets) {
    const keys = RESOURCE_KEYS_MAP[targetName];
    if (!keys) continue;

    const data = state[targetName];
    if (!data) continue;

    const usages = [];
    checkNode(data, itemId, keys, usages);

    if (usages.length > 0) {
      inProps[targetName] = usages;
    }
  }

  const totalUsageCount = Object.values(inProps).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  return {
    inProps,
    isUsed: totalUsageCount > 0,
    count: totalUsageCount,
  };
};

export const collectUsedResourcesForExport = (state) => {
  const usage = createUsageBuckets();
  const index = createResourceIndex(state);
  const layoutQueue = [];
  const typographyQueue = [];
  const characterQueue = [];
  const scannedLayouts = new Set();
  const scannedTypography = new Set();
  const scannedCharacters = new Set();

  const addUsed = (type, id) => {
    if (!usage[type] || !id) return false;
    if (usage[type].has(id)) return false;
    usage[type].add(id);

    if (type === "layouts") {
      layoutQueue.push(id);
    } else if (type === "typography") {
      typographyQueue.push(id);
    } else if (type === "characters") {
      characterQueue.push(id);
    } else if (type === "sprites") {
      const ownerId = index.spriteOwnerById.get(id);
      if (ownerId) {
        addUsed("characters", ownerId);
      }
    }

    return true;
  };

  const markReference = ({ key, value }) => {
    const preferredTypes = RESOURCE_KEY_TO_TYPES[key] || [];
    let matchedPreferredType = false;

    for (const type of preferredTypes) {
      if (index.byType[type]?.has(value)) {
        addUsed(type, value);
        matchedPreferredType = true;
      }
    }

    if (matchedPreferredType) return;

    const candidateTypes = index.byId.get(value);
    if (!candidateTypes) return;
    for (const type of candidateTypes) {
      addUsed(type, value);
    }
  };

  scanNodeForResourceReferences(state?.scenes, markReference);

  while (layoutQueue.length > 0) {
    const layoutId = layoutQueue.shift();
    if (scannedLayouts.has(layoutId)) continue;
    scannedLayouts.add(layoutId);
    const layout = getCollectionItems(state, "layouts")[layoutId];
    if (!layout || layout.type !== "layout") continue;
    scanNodeForResourceReferences(layout, markReference);
  }

  while (typographyQueue.length > 0) {
    const typographyId = typographyQueue.shift();
    if (scannedTypography.has(typographyId)) continue;
    scannedTypography.add(typographyId);
    const typography = getCollectionItems(state, "typography")[typographyId];
    if (!typography || typography.type !== "typography") continue;
    scanNodeForResourceReferences(typography, markReference);
  }

  while (characterQueue.length > 0) {
    const characterId = characterQueue.shift();
    if (scannedCharacters.has(characterId)) continue;
    scannedCharacters.add(characterId);

    const character = getCollectionItems(state, "characters")[characterId];
    if (!character || character.type !== "character") continue;

    for (const spriteId of Object.keys(character.sprites?.items || {})) {
      addUsed("sprites", spriteId);
    }
  }

  const fileIds = new Set();
  const addFileId = (fileId) => {
    if (fileId) fileIds.add(fileId);
  };

  const imageItems = getCollectionItems(state, "images");
  for (const id of usage.images) {
    addFileId(imageItems[id]?.fileId);
  }

  const videoItems = getCollectionItems(state, "videos");
  for (const id of usage.videos) {
    addFileId(videoItems[id]?.fileId);
  }

  const soundItems = getCollectionItems(state, "sounds");
  for (const id of usage.sounds) {
    addFileId(soundItems[id]?.fileId);
  }

  const fontItems = getCollectionItems(state, "fonts");
  for (const id of usage.fonts) {
    addFileId(fontItems[id]?.fileId);
  }

  for (const spriteId of usage.sprites) {
    addFileId(index.spriteFileById.get(spriteId));
  }

  const usedIds = Object.fromEntries(
    Object.entries(usage).map(([type, ids]) => [type, Array.from(ids)]),
  );

  return {
    usedIds,
    fileIds: Array.from(fileIds),
  };
};

export const buildFilteredStateForExport = (
  state,
  usage,
  options = { keepAllVariables: true },
) => {
  const usedIds = usage?.usedIds || {};
  const keepAllVariables = options?.keepAllVariables ?? true;

  return {
    ...state,
    images: filterCollectionItemsByIds(state.images, usedIds.images || []),
    videos: filterCollectionItemsByIds(state.videos, usedIds.videos || []),
    sounds: filterCollectionItemsByIds(state.sounds, usedIds.sounds || []),
    tweens: filterCollectionItemsByIds(state.tweens, usedIds.tweens || []),
    transforms: filterCollectionItemsByIds(
      state.transforms,
      usedIds.transforms || [],
    ),
    characters: filterCollectionItemsByIds(
      state.characters,
      usedIds.characters || [],
    ),
    fonts: filterCollectionItemsByIds(state.fonts, usedIds.fonts || []),
    colors: filterCollectionItemsByIds(state.colors, usedIds.colors || []),
    typography: filterCollectionItemsByIds(
      state.typography,
      usedIds.typography || [],
    ),
    layouts: filterCollectionItemsByIds(state.layouts, usedIds.layouts || []),
    variables: keepAllVariables
      ? state.variables
      : filterCollectionItemsByIds(state.variables, usedIds.variables || []),
  };
};
