import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { buildCharacterSpritePreviewFileIds } from "../../internal/characterSpritePreview.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const ANIMATION_MODE_OPTIONS = [
  {
    label: "None",
    value: "none",
  },
  {
    label: "Update",
    value: "update",
  },
  {
    label: "Transition",
    value: "transition",
  },
];

const UNGROUPED_CHARACTER_GROUP_ID = "__ungrouped_characters__";
const UNGROUPED_SPRITE_GROUP_ID = "__ungrouped_sprites__";
const UNGROUPED_GROUP_LABEL = "Ungrouped";
const DEFAULT_SPRITE_GROUP_ID = "base";
const DEFAULT_SPRITE_GROUP_NAME = "Sprite";

const getAnimationType = (item = {}) => {
  return item?.animation?.type === "transition" ? "transition" : "update";
};

const getAnimationItemById = (collection = {}, animationId) => {
  if (!animationId) {
    return undefined;
  }

  return toFlatItems(collection).find(
    (item) => item.id === animationId && item.type === "animation",
  );
};

const getAnimationModeById = (collection = {}, animationId) => {
  const item = getAnimationItemById(collection, animationId);
  return item ? getAnimationType(item) : undefined;
};

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

const buildSpriteSelectionGroups = (character = {}) => {
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

const buildTempSelectedSpriteIdsByGroup = ({
  character,
  spriteSelectionGroups,
} = {}) => {
  const nextSelectedSpriteIds = {};
  const currentSprites = Array.isArray(character?.sprites)
    ? character.sprites
    : [];
  const firstSelectedSpriteId = currentSprites.find(
    (sprite) =>
      typeof sprite?.resourceId === "string" && sprite.resourceId.length > 0,
  )?.resourceId;

  for (const [index, spriteSelectionGroup] of (
    spriteSelectionGroups ?? []
  ).entries()) {
    const matchingSprite = currentSprites.find(
      (sprite) =>
        sprite?.id === spriteSelectionGroup.id &&
        typeof sprite?.resourceId === "string" &&
        sprite.resourceId.length > 0,
    );

    if (matchingSprite?.resourceId) {
      nextSelectedSpriteIds[spriteSelectionGroup.id] =
        matchingSprite.resourceId;
      continue;
    }

    if (index === 0 && firstSelectedSpriteId) {
      nextSelectedSpriteIds[spriteSelectionGroup.id] = firstSelectedSpriteId;
    }
  }

  return nextSelectedSpriteIds;
};

const buildSpriteGroupBoxViewData = ({
  spriteSelectionGroups,
  selectedSpriteIdsByGroup,
  spritesCollection,
} = {}) => {
  const spriteItemsById = Object.fromEntries(
    toFlatItems(spritesCollection ?? createEmptyCollection())
      .filter((item) => item.type === "image")
      .map((item) => [item.id, item]),
  );

  return (spriteSelectionGroups ?? []).map((spriteSelectionGroup) => {
    const selectedSpriteId =
      selectedSpriteIdsByGroup?.[spriteSelectionGroup.id];
    const selectedSprite = selectedSpriteId
      ? spriteItemsById[selectedSpriteId]
      : undefined;

    return {
      id: spriteSelectionGroup.id,
      name: spriteSelectionGroup.name,
      selectedSpriteId,
      selectedSpriteName: selectedSprite?.name ?? "No sprite",
      hasSelection: !!selectedSpriteId,
    };
  });
};

const matchesSpriteGroupTags = ({ item, tagIds } = {}) => {
  if (!Array.isArray(tagIds) || tagIds.length === 0) {
    return true;
  }

  const itemTagIds = Array.isArray(item?.tagIds) ? item.tagIds : [];
  return tagIds.some((tagId) => itemTagIds.includes(tagId));
};

const normalizeSelectedCharacter = (character = {}, animations = {}) => {
  const nextCharacter = structuredClone(character ?? {});
  const selectedAnimationId = nextCharacter?.animations?.resourceId;
  const selectedAnimationMode = getAnimationModeById(
    animations,
    selectedAnimationId,
  );

  nextCharacter.animationMode =
    nextCharacter.animationMode ??
    selectedAnimationMode ??
    (selectedAnimationId ? "update" : "none");

  return nextCharacter;
};

export const createInitialState = () => ({
  mode: "current",
  items: createEmptyCollection(),
  transforms: createEmptyCollection(),
  animations: createEmptyCollection(),
  /**
   * Array of raw character objects with the following structure (same as props):
   * {
   *   id: string,              // Character ID from repository
   *   transformId: string,     // Transform ID
   *   animations: object,      // Optional animation selection with resourceId
   *   sprites: array,          // Array of sprites with resourceId
   *   spriteName: string       // Display name for sprite
   * }
   */
  selectedCharacters: [],
  tempSelectedCharacterId: undefined,
  tempSelectedSpriteIds: {},
  selectedSpriteGroupId: undefined,
  selectedCharacterIndex: undefined, // For sprite selection
  pendingCharacterIndex: undefined,
  searchQuery: "",
  fullImagePreviewVisible: false,
  fullImagePreviewFileId: undefined,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    characterIndex: null,
    items: [{ label: "Delete", type: "item", value: "delete" }],
  },
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setItems = ({ state }, { items } = {}) => {
  state.items = items;
};

export const setTransforms = ({ state }, { transforms } = {}) => {
  state.transforms = transforms;
};

export const setAnimations = ({ state }, { animations } = {}) => {
  state.animations = animations;
  state.selectedCharacters = state.selectedCharacters.map((character) =>
    normalizeSelectedCharacter(character, state.animations),
  );
};

const getCharacterItemById = ({ state, characterId } = {}) => {
  if (!characterId) {
    return undefined;
  }

  return toFlatItems(state.items || []).find(
    (item) => item.id === characterId && item.type === "character",
  );
};

const getSpriteSelectionGroupsForCharacterId = ({ state, characterId } = {}) =>
  buildSpriteSelectionGroups(getCharacterItemById({ state, characterId }));

const getSpriteSelectionGroupsForCharacterIndex = ({ state, index } = {}) => {
  if (!Number.isInteger(index)) {
    return [];
  }

  const characterId = state.selectedCharacters?.[index]?.id;
  return getSpriteSelectionGroupsForCharacterId({ state, characterId });
};

const resolveSelectedSpriteGroupId = ({
  state,
  spriteSelectionGroups,
} = {}) => {
  if (
    spriteSelectionGroups?.some(
      (spriteSelectionGroup) =>
        spriteSelectionGroup.id === state.selectedSpriteGroupId,
    )
  ) {
    return state.selectedSpriteGroupId;
  }

  return spriteSelectionGroups?.[0]?.id;
};

export const addCharacter = ({ state }, { id } = {}) => {
  // Get the first available transform as default
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "transform",
  );
  const defaultTransform =
    transformItems.length > 0 ? transformItems[0].id : undefined;

  // Store raw character data (same structure as from props)
  state.selectedCharacters.push({
    id: id,
    transformId: defaultTransform,
    sprites: [],
    spriteName: "",
    animationMode: "none",
  });
};

export const removeCharacter = ({ state }, { index } = {}) => {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.selectedCharacters.length
  ) {
    return;
  }

  state.selectedCharacters.splice(index, 1);

  if (state.pendingCharacterIndex === index) {
    state.pendingCharacterIndex = undefined;
  } else if (
    Number.isInteger(state.pendingCharacterIndex) &&
    state.pendingCharacterIndex > index
  ) {
    state.pendingCharacterIndex -= 1;
  }

  if (state.selectedCharacterIndex === index) {
    state.selectedCharacterIndex = undefined;
    state.tempSelectedSpriteIds = {};
    state.selectedSpriteGroupId = undefined;
    return;
  }

  if (
    Number.isInteger(state.selectedCharacterIndex) &&
    state.selectedCharacterIndex > index
  ) {
    state.selectedCharacterIndex -= 1;
  }
};

export const updateCharacterTransform = (
  { state },
  { index, transform } = {},
) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].transformId = transform;
  }
};

export const updateCharacterAnimation = (
  { state },
  { index, animationId } = {},
) => {
  if (!state.selectedCharacters[index]) {
    return;
  }

  if (!animationId || animationId === "none") {
    state.selectedCharacters[index].animations = undefined;
    return;
  }

  state.selectedCharacters[index].animations = {
    resourceId: animationId,
  };

  const selectedAnimationMode = getAnimationModeById(
    state.animations,
    animationId,
  );
  if (selectedAnimationMode) {
    state.selectedCharacters[index].animationMode = selectedAnimationMode;
  }
};

export const updateCharacterAnimationMode = (
  { state },
  { index, animationMode } = {},
) => {
  if (!state.selectedCharacters[index]) {
    return;
  }

  if (animationMode !== "update" && animationMode !== "transition") {
    state.selectedCharacters[index].animationMode = "none";
    state.selectedCharacters[index].animations = undefined;
    return;
  }

  state.selectedCharacters[index].animationMode = animationMode;

  const selectedAnimationId =
    state.selectedCharacters[index]?.animations?.resourceId;
  const selectedAnimationMode = getAnimationModeById(
    state.animations,
    selectedAnimationId,
  );
  if (selectedAnimationMode && selectedAnimationMode !== animationMode) {
    state.selectedCharacters[index].animations = undefined;
  }
};

export const updateCharacterSprite = ({ state }, { index, spriteId } = {}) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].sprites = [
      {
        id: DEFAULT_SPRITE_GROUP_ID,
        resourceId: spriteId,
      },
    ];
  }
};

export const updateCharacterSprites = ({ state }, { index, sprites } = {}) => {
  if (!state.selectedCharacters[index]) {
    return;
  }

  state.selectedCharacters[index].sprites = Array.isArray(sprites)
    ? sprites
    : [];
};

export const updateCharacterSpriteName = (
  { state },
  { index, spriteName } = {},
) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].spriteName = spriteName;
  }
};

export const clearCharacters = ({ state }, _payload = {}) => {
  state.selectedCharacters = [];
  state.pendingCharacterIndex = undefined;
  state.selectedCharacterIndex = undefined;
  state.tempSelectedSpriteIds = {};
  state.selectedSpriteGroupId = undefined;
};

export const setTempSelectedCharacterId = ({ state }, { characterId } = {}) => {
  state.tempSelectedCharacterId = characterId;
};

export const setTempSelectedSpriteIds = (
  { state },
  { spriteIdsByGroupId } = {},
) => {
  state.tempSelectedSpriteIds = { ...spriteIdsByGroupId };
};

export const clearTempSelectedSpriteIds = ({ state }) => {
  state.tempSelectedSpriteIds = {};
};

export const setTempSelectedSpriteId = (
  { state },
  { groupId, spriteId } = {},
) => {
  const nextGroupId =
    groupId ?? state.selectedSpriteGroupId ?? DEFAULT_SPRITE_GROUP_ID;

  if (!nextGroupId) {
    return;
  }

  if (!spriteId) {
    delete state.tempSelectedSpriteIds[nextGroupId];
    return;
  }

  state.tempSelectedSpriteIds[nextGroupId] = spriteId;
};

export const setSelectedSpriteGroupId = ({ state }, { spriteGroupId } = {}) => {
  state.selectedSpriteGroupId = spriteGroupId;
};

export const setSearchQuery = ({ state }, { value } = {}) => {
  state.searchQuery = value ?? "";
};

export const showFullImagePreview = ({ state }, { fileId } = {}) => {
  if (!fileId) {
    return;
  }

  state.fullImagePreviewVisible = true;
  state.fullImagePreviewFileId = fileId;
};

export const hideFullImagePreview = ({ state }, _payload = {}) => {
  state.fullImagePreviewVisible = false;
  state.fullImagePreviewFileId = undefined;
};

export const setSelectedCharacterIndex = ({ state }, { index } = {}) => {
  state.selectedCharacterIndex = index;
};

export const setPendingCharacterIndex = ({ state }, { index } = {}) => {
  state.pendingCharacterIndex = index;
};

export const clearPendingCharacterIndex = ({ state }) => {
  state.pendingCharacterIndex = undefined;
};

export const selectTempSelectedCharacterId = ({ state }) => {
  return state.tempSelectedCharacterId;
};

export const selectTempSelectedSpriteIds = ({ state }) => {
  return state.tempSelectedSpriteIds;
};

export const selectTempSelectedSpriteId = ({ state }, { groupId } = {}) => {
  const spriteSelectionGroups = getSpriteSelectionGroupsForCharacterIndex({
    state,
    index: state.selectedCharacterIndex,
  });
  const nextGroupId =
    groupId ??
    resolveSelectedSpriteGroupId({
      state,
      spriteSelectionGroups,
    });

  return nextGroupId ? state.tempSelectedSpriteIds?.[nextGroupId] : undefined;
};

export const showDropdownMenu = (
  { state },
  { position, characterIndex } = {},
) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.characterIndex = characterIndex;
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.characterIndex = null;
};

export const selectDropdownMenuCharacterIndex = ({ state }) => {
  return state.dropdownMenu.characterIndex;
};

export const selectSelectedCharacters = ({ state }) => {
  return state.selectedCharacters;
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const selectSelectedCharacterIndex = ({ state }) => {
  return state.selectedCharacterIndex;
};

export const selectPendingCharacterIndex = ({ state }) => {
  return state.pendingCharacterIndex;
};

export const selectSelectedSpriteGroupId = ({ state }) => {
  return resolveSelectedSpriteGroupId({
    state,
    spriteSelectionGroups: getSpriteSelectionGroupsForCharacterIndex({
      state,
      index: state.selectedCharacterIndex,
    }),
  });
};

export const selectSpriteSelectionGroupsForCharacterIndex = (
  { state },
  { index } = {},
) => {
  return getSpriteSelectionGroupsForCharacterIndex({ state, index });
};

export const selectCurrentSpriteSelectionGroups = ({ state }) => {
  return getSpriteSelectionGroupsForCharacterIndex({
    state,
    index: state.selectedCharacterIndex,
  });
};

export const selectCurrentSpriteItemById = ({ state }, { spriteId } = {}) => {
  const characters = selectCharactersWithRepositoryData({ state });
  const character = characters[state.selectedCharacterIndex];
  if (!character?.sprites) {
    return undefined;
  }

  return toFlatItems(character.sprites).find((item) => item.id === spriteId);
};

export const setExistingCharacters = ({ state }, { characters } = {}) => {
  state.selectedCharacters = (Array.isArray(characters) ? characters : []).map(
    (character) => normalizeSelectedCharacter(character, state.animations),
  );
};

export const selectCharactersWithRepositoryData = ({ state }) => {
  if (!state.selectedCharacters || !Array.isArray(state.selectedCharacters)) {
    return [];
  }

  return state.selectedCharacters.map((char) => {
    const characterData = getCharacterItemById({
      state,
      characterId: char.id,
    });
    const spriteSelectionGroups = buildSpriteSelectionGroups(characterData);
    const selectedSpriteIdsByGroup = buildTempSelectedSpriteIdsByGroup({
      character: char,
      spriteSelectionGroups,
    });
    const previewSpriteId =
      selectedSpriteIdsByGroup[spriteSelectionGroups[0]?.id] ??
      Object.values(selectedSpriteIdsByGroup)[0];
    const spritePreviewFileIds = buildCharacterSpritePreviewFileIds({
      spritesCollection: characterData?.sprites,
      spriteIds: spriteSelectionGroups.map(
        (spriteSelectionGroup) =>
          selectedSpriteIdsByGroup?.[spriteSelectionGroup.id],
      ),
    });
    const spriteGroupBoxes = buildSpriteGroupBoxViewData({
      spriteSelectionGroups,
      selectedSpriteIdsByGroup,
      spritesCollection: characterData?.sprites,
    });

    if (!characterData) {
      return {
        id: char.id,
        name: "Unknown Character",
        transformId: char.transformId,
        animations: char.animations,
        animationMode: char.animationMode,
        spriteGroups: spriteSelectionGroups,
        spriteGroupBoxes,
        showSpriteGroupBoxes: spriteSelectionGroups.length > 1,
        spriteId: previewSpriteId,
        hasSpritePreview: spritePreviewFileIds.length > 0,
        spritePreviewFileIds,
        spriteFileId: undefined,
        spriteName: char.spriteName || "",
      };
    }

    let spriteFileId = undefined;
    if (previewSpriteId && characterData.sprites) {
      const sprite = toFlatItems(characterData.sprites).find(
        (s) => s.id === previewSpriteId,
      );
      if (sprite) {
        spriteFileId = sprite.fileId;
      }
    }

    return {
      ...characterData,
      transformId: char.transformId,
      animations: char.animations,
      animationMode: char.animationMode,
      spriteGroups: spriteSelectionGroups,
      spriteGroupBoxes,
      showSpriteGroupBoxes: spriteSelectionGroups.length > 1,
      spriteId: previewSpriteId,
      hasSpritePreview: spritePreviewFileIds.length > 0,
      spritePreviewFileIds,
      spriteFileId,
      spriteName: char.spriteName || "",
    };
  });
};

const form = {
  fields: [
    {
      type: "slot",
      slot: "characters",
      description: "Characters",
    },
  ],
};

export const selectViewData = ({ state }) => {
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };

  const buildSelectableTreeData = ({
    collection,
    selectedItemId,
    syntheticRootId,
    itemFilter = () => true,
    hideEmptyGroups = false,
  } = {}) => {
    const allItems = toFlatItems(collection);
    const filterVisibleItem = (item) => itemFilter(item) && matchesSearch(item);
    const rootChildren = allItems.filter(
      (item) => item.type !== "folder" && item.parentId === null,
    );
    const visibleRootChildren = rootChildren
      .filter(filterVisibleItem)
      .map((child) => {
        const isSelected = child.id === selectedItemId;
        return {
          ...child,
          itemBorderColor: isSelected ? "pr" : "bo",
          itemHoverBorderColor: isSelected ? "pr" : "ac",
        };
      });

    const groups = toFlatGroups(collection)
      .map((group) => {
        const children = group.children
          .filter(filterVisibleItem)
          .map((child) => {
            const isSelected = child.id === selectedItemId;
            return {
              ...child,
              itemBorderColor: isSelected ? "pr" : "bo",
              itemHoverBorderColor: isSelected ? "pr" : "ac",
            };
          });

        return {
          ...group,
          children,
          hasChildren: children.length > 0,
          shouldDisplay:
            children.length > 0 || (!hideEmptyGroups && !searchQuery),
        };
      })
      .filter((group) => group.shouldDisplay);

    const visibleGroupIds = new Set(groups.map((group) => group.id));
    const explorerItems = allItems.filter(
      (item) =>
        item.type === "folder" &&
        (!hideEmptyGroups || visibleGroupIds.has(item.id)),
    );

    if (
      hideEmptyGroups ? visibleRootChildren.length > 0 : rootChildren.length > 0
    ) {
      explorerItems.unshift({
        id: syntheticRootId,
        type: "folder",
        name: UNGROUPED_GROUP_LABEL,
        fullLabel: UNGROUPED_GROUP_LABEL,
        _level: 0,
        parentId: null,
        hasChildren: true,
      });
    }

    if (visibleRootChildren.length > 0) {
      groups.unshift({
        id: syntheticRootId,
        type: "folder",
        name: UNGROUPED_GROUP_LABEL,
        fullLabel: UNGROUPED_GROUP_LABEL,
        _level: 0,
        parentId: null,
        hasChildren: true,
        children: visibleRootChildren,
        shouldDisplay: true,
      });
    }

    return {
      explorerItems,
      groups,
    };
  };

  const characterTreeData = buildSelectableTreeData({
    collection: state.items,
    selectedItemId: state.tempSelectedCharacterId,
    syntheticRootId: UNGROUPED_CHARACTER_GROUP_ID,
  });

  // Initialize sprite data (will be populated later after processedSelectedCharacters is defined)
  let spriteItems = [];
  let spriteGroups = [];
  let selectedCharacterName = "";
  let spriteSelectionTabs = [];
  let selectedSpriteGroupId = undefined;
  let selectedSpriteGroupName = "";

  // Get transform options from repository instead of hardcoded values
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "transform",
  );
  const transformOptions = transformItems.map((transform) => ({
    label: transform.name,
    value: transform.id,
  }));
  const animationItems = toFlatItems(state.animations).filter(
    (item) => item.type === "animation",
  );
  const updateAnimationOptions = animationItems
    .filter((item) => getAnimationType(item) === "update")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));
  const transitionAnimationOptions = animationItems
    .filter((item) => getAnimationType(item) === "transition")
    .map((item) => ({
      value: item.id,
      label: item.name,
    }));

  // Get enriched character data
  const enrichedCharacters = selectCharactersWithRepositoryData({ state });
  const processedSelectedCharacters = enrichedCharacters.map((character) => ({
    ...character,
    displayName: character.name || "Unnamed Character",
    animationMode:
      character.animationMode ??
      getAnimationModeById(
        state.animations,
        character.animations?.resourceId,
      ) ??
      "none",
  }));

  // Get sprite data for the selected character (after processedSelectedCharacters is defined)
  if (
    state.mode === "sprite-select" &&
    state.selectedCharacterIndex !== undefined
  ) {
    const enrichedSelectedChar =
      processedSelectedCharacters[state.selectedCharacterIndex];
    const currentSpriteSelectionGroups =
      getSpriteSelectionGroupsForCharacterIndex({
        state,
        index: state.selectedCharacterIndex,
      });

    spriteSelectionTabs = currentSpriteSelectionGroups.map(
      (spriteSelectionGroup) => ({
        id: spriteSelectionGroup.id,
        label: spriteSelectionGroup.name,
      }),
    );
    selectedSpriteGroupId = resolveSelectedSpriteGroupId({
      state,
      spriteSelectionGroups: currentSpriteSelectionGroups,
    });
    selectedSpriteGroupName =
      currentSpriteSelectionGroups.find(
        (spriteSelectionGroup) =>
          spriteSelectionGroup.id === selectedSpriteGroupId,
      )?.name ?? "";
    const selectedSpriteGroupTags =
      currentSpriteSelectionGroups.find(
        (spriteSelectionGroup) =>
          spriteSelectionGroup.id === selectedSpriteGroupId,
      )?.tags ?? [];
    const selectedSpriteId =
      selectedSpriteGroupId &&
      state.tempSelectedSpriteIds?.[selectedSpriteGroupId];

    if (enrichedSelectedChar && enrichedSelectedChar.sprites) {
      selectedCharacterName = enrichedSelectedChar.name || "Character";
      const spriteTreeData = buildSelectableTreeData({
        collection: enrichedSelectedChar.sprites,
        selectedItemId: selectedSpriteId,
        syntheticRootId: UNGROUPED_SPRITE_GROUP_ID,
        itemFilter: (item) =>
          matchesSpriteGroupTags({
            item,
            tagIds: selectedSpriteGroupTags,
          }),
        hideEmptyGroups: selectedSpriteGroupTags.length > 0,
      });
      spriteItems = spriteTreeData.explorerItems;
      spriteGroups = spriteTreeData.groups;
    }
  }

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
  ];

  if (state.mode === "character-select") {
    breadcrumb.push({
      id: "current",
      label: "Characters",
      click: true,
    });
    breadcrumb.push({
      label: "Select",
    });
  } else if (state.mode === "sprite-select") {
    breadcrumb.push({
      id: "current",
      label: "Characters",
      click: true,
    });
    breadcrumb.push({
      id: "character-select",
      label: selectedCharacterName || "Character",
      click: true,
    });
    breadcrumb.push({
      label: "Sprite Selection",
    });
  } else {
    breadcrumb.push({
      label: "Characters",
    });
  }

  // Create default values with character data and options
  const defaultValues = {
    characters: processedSelectedCharacters.map((char) => ({
      ...char,
      // Ensure transformId is set, use first transform as fallback if needed
      transformId:
        char.transformId ||
        (transformOptions.length > 0 ? transformOptions[0].value : undefined),
      animationId: char.animations?.resourceId,
    })),
    transformOptions,
    animationModeOptions: ANIMATION_MODE_OPTIONS,
    updateAnimationOptions,
    transitionAnimationOptions,
  };

  return {
    mode: state.mode,
    items: characterTreeData.explorerItems,
    groups: characterTreeData.groups,
    selectedCharacters: processedSelectedCharacters,
    transformOptions,
    animationModeOptions: ANIMATION_MODE_OPTIONS,
    updateAnimationOptions,
    transitionAnimationOptions,
    spriteItems,
    spriteGroups,
    showSpriteGroupTabs: spriteSelectionTabs.length > 1,
    spriteSelectionTabs,
    selectedSpriteGroupId,
    selectedSpriteGroupName,
    selectedCharacterName,
    searchQuery: state.searchQuery,
    searchPlaceholder: "Search...",
    fullImagePreviewVisible: state.fullImagePreviewVisible,
    fullImagePreviewFileId: state.fullImagePreviewFileId,
    breadcrumb,
    form,
    defaultValues,
    dropdownMenu: state.dropdownMenu,
  };
};
