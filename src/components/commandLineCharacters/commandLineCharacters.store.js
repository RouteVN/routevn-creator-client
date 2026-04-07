import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";

export const createInitialState = () => ({
  mode: "current",
  items: { items: {}, tree: [] },
  transforms: { tree: [], items: {} },
  /**
   * Array of raw character objects with the following structure (same as props):
   * {
   *   id: string,              // Character ID from repository
   *   transformId: string,     // Transform ID
   *   sprites: array,          // Array of sprites with resourceId
   *   spriteName: string       // Display name for sprite
   * }
   */
  selectedCharacters: [],
  tempSelectedCharacterId: undefined,
  tempSelectedSpriteId: undefined,
  selectedCharacterIndex: undefined, // For sprite selection
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
  });
};

export const removeCharacter = ({ state }, { index } = {}) => {
  state.selectedCharacters.splice(index, 1);
};

export const updateCharacterTransform = (
  { state },
  { index, transform } = {},
) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].transformId = transform;
  }
};

export const updateCharacterSprite = ({ state }, { index, spriteId } = {}) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].sprites = [
      {
        id: "base",
        resourceId: spriteId,
      },
    ];
  }
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
};

export const setTempSelectedCharacterId = ({ state }, { characterId } = {}) => {
  state.tempSelectedCharacterId = characterId;
};

export const setTempSelectedSpriteId = ({ state }, { spriteId } = {}) => {
  state.tempSelectedSpriteId = spriteId;
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

export const selectTempSelectedCharacterId = ({ state }) => {
  return state.tempSelectedCharacterId;
};

export const selectTempSelectedSpriteId = ({ state }) => {
  return state.tempSelectedSpriteId;
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

export const selectCurrentSpriteItemById = ({ state }, { spriteId } = {}) => {
  const characters = selectCharactersWithRepositoryData({ state });
  const character = characters[state.selectedCharacterIndex];
  if (!character?.sprites) {
    return undefined;
  }

  return toFlatItems(character.sprites).find((item) => item.id === spriteId);
};

export const setExistingCharacters = ({ state }, { characters } = {}) => {
  state.selectedCharacters = characters;
};

export const selectCharactersWithRepositoryData = ({ state }) => {
  if (!state.selectedCharacters || !Array.isArray(state.selectedCharacters)) {
    return [];
  }

  const characterItems = toFlatItems(state.items || []);

  return state.selectedCharacters.map((char) => {
    // Find the character data from repository
    const characterData = characterItems.find((item) => item.id === char.id);

    if (!characterData) {
      // Return a minimal character object if repository data is missing
      return {
        id: char.id,
        name: "Unknown Character",
        transformId: char.transformId,
        spriteId: char.sprites?.[0]?.resourceId,
        spriteFileId: undefined,
        spriteName: char.spriteName || "",
      };
    }

    // Find sprite data if available
    let spriteFileId = undefined;
    if (char.sprites?.[0]?.resourceId && characterData.sprites) {
      const sprite = toFlatItems(characterData.sprites).find(
        (s) => s.id === char.sprites[0].resourceId,
      );
      if (sprite) {
        spriteFileId = sprite.fileId;
      }
    }

    return {
      ...characterData,
      transformId: char.transformId,
      spriteId: char.sprites?.[0]?.resourceId,
      spriteFileId: spriteFileId,
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
  const flatItems = toFlatItems(state.items).filter(
    (item) => item.type === "folder",
  );
  const searchQuery = (state.searchQuery ?? "").toLowerCase().trim();
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    const name = (item.name ?? "").toLowerCase();
    const description = (item.description ?? "").toLowerCase();
    return name.includes(searchQuery) || description.includes(searchQuery);
  };
  const flatGroups = toFlatGroups(state.items)
    .map((group) => {
      const children = group.children.filter(matchesSearch).map((child) => {
        const isSelected = child.id === state.tempSelectedCharacterId;
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
        shouldDisplay: !searchQuery || children.length > 0,
      };
    })
    .filter((group) => group.shouldDisplay);

  // Initialize sprite data (will be populated later after processedSelectedCharacters is defined)
  let spriteItems = [];
  let spriteGroups = [];
  let selectedCharacterName = "";

  // Get transform options from repository instead of hardcoded values
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "transform",
  );
  const transformOptions = transformItems.map((transform) => ({
    label: transform.name,
    value: transform.id,
  }));

  // Get enriched character data
  const enrichedCharacters = selectCharactersWithRepositoryData({ state });
  const processedSelectedCharacters = enrichedCharacters.map((character) => ({
    ...character,
    displayName: character.name || "Unnamed Character",
  }));

  // Get sprite data for the selected character (after processedSelectedCharacters is defined)
  if (
    state.mode === "sprite-select" &&
    state.selectedCharacterIndex !== undefined
  ) {
    // Get the enriched character data which includes sprites from repository
    const enrichedSelectedChar =
      processedSelectedCharacters[state.selectedCharacterIndex];

    if (enrichedSelectedChar && enrichedSelectedChar.sprites) {
      selectedCharacterName = enrichedSelectedChar.name || "Character";
      spriteItems = toFlatItems(enrichedSelectedChar.sprites).filter(
        (item) => item.type === "folder",
      );

      spriteGroups = toFlatGroups(enrichedSelectedChar.sprites)
        .map((group) => {
          const children = group.children.filter(matchesSearch).map((child) => {
            const isSelected = child.id === state.tempSelectedSpriteId;
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
            shouldDisplay: !searchQuery || children.length > 0,
          };
        })
        .filter((group) => group.shouldDisplay);
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
    })),
    transformOptions,
  };

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    selectedCharacters: processedSelectedCharacters,
    transformOptions,
    spriteItems,
    spriteGroups,
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
