import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  transforms: { tree: [], items: {} },
  /**
   * Array of raw character objects with the following structure (same as props):
   * {
   *   id: string,              // Character ID from repository
   *   transformId: string,     // Transform/placement ID
   *   sprites: array,          // Array of sprites with imageId
   *   spriteName: string       // Display name for sprite
   * }
   */
  selectedCharacters: [],
  tempSelectedCharacterId: undefined,
  tempSelectedSpriteId: undefined,
  selectedCharacterIndex: undefined, // For sprite selection
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    characterIndex: null,
    items: [{ label: "Delete", type: "item", value: "delete" }],
  },
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const setTransforms = (state, payload) => {
  state.transforms = payload.transforms;
};

export const addCharacter = (state, payload) => {
  // Get the first available transform as default
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "placement",
  );
  const defaultTransform =
    transformItems.length > 0 ? transformItems[0].id : undefined;

  // Store raw character data (same structure as from props)
  state.selectedCharacters.push({
    id: payload.id,
    transformId: defaultTransform,
    sprites: [],
    spriteName: "",
  });
};

export const removeCharacter = (state, index) => {
  state.selectedCharacters.splice(index, 1);
};

export const updateCharacterTransform = (state, { index, transform }) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].transformId = transform;
  }
};

export const updateCharacterSprite = (
  state,
  { index, spriteId, spriteFileId },
) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].sprites = [
      {
        id: "base",
        imageId: spriteId,
      },
    ];
  }
};

export const updateCharacterSpriteName = (state, { index, spriteName }) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].spriteName = spriteName;
  }
};

export const clearCharacters = (state) => {
  state.selectedCharacters = [];
};

export const setTempSelectedCharacterId = (state, payload) => {
  state.tempSelectedCharacterId = payload.characterId;
};

export const setTempSelectedSpriteId = (state, payload) => {
  state.tempSelectedSpriteId = payload.spriteId;
};

export const setSelectedCharacterIndex = (state, payload) => {
  state.selectedCharacterIndex = payload.index;
};

export const selectTempSelectedCharacterId = ({ state }) => {
  return state.tempSelectedCharacterId;
};

export const selectTempSelectedSpriteId = ({ state }) => {
  return state.tempSelectedSpriteId;
};

export const showDropdownMenu = (state, { position, characterIndex }) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.position = position;
  state.dropdownMenu.characterIndex = characterIndex;
};

export const hideDropdownMenu = (state) => {
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

export const setExistingCharacters = (state, payload) => {
  state.selectedCharacters = payload.characters;
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
        spriteId: char.sprites?.[0]?.imageId,
        spriteFileId: undefined,
        spriteName: char.spriteName || "",
      };
    }

    // Find sprite data if available
    let spriteFileId = undefined;
    if (char.sprites?.[0]?.imageId && characterData.sprites) {
      const sprite = toFlatItems(characterData.sprites).find(
        (s) => s.id === char.sprites[0].imageId,
      );
      if (sprite) {
        spriteFileId = sprite.fileId;
      }
    }

    return {
      ...characterData,
      transformId: char.transformId,
      spriteId: char.sprites?.[0]?.imageId,
      spriteFileId: spriteFileId,
      spriteName: char.spriteName || "",
    };
  });
};

const form = {
  fields: [
    {
      inputType: "slot",
      slot: "characters",
      description: "Characters",
    },
  ],
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.items).filter(
    (item) => item.type === "folder",
  );
  const flatGroups = toFlatGroups(state.items).map((group) => {
    return {
      ...group,
      children: group.children.map((child) => {
        const isSelected = child.id === state.tempSelectedCharacterId;
        return {
          ...child,
          bw: isSelected ? "md" : "",
        };
      }),
    };
  });

  // Initialize sprite data (will be populated later after processedSelectedCharacters is defined)
  let spriteItems = [];
  let spriteGroups = [];
  let selectedCharacterName = "";

  // Get transform options from repository instead of hardcoded values
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "placement",
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

      spriteGroups = toFlatGroups(enrichedSelectedChar.sprites).map((group) => {
        return {
          ...group,
          children: group.children.map((child) => {
            const isSelected = child.id === state.tempSelectedSpriteId;
            return {
              ...child,
              bw: isSelected ? "md" : "",
            };
          }),
        };
      });
    }
  }

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
  ];

  if (state.mode === "character-select") {
    breadcrumb.push({
      id: "current",
      label: "Characters",
    });
    breadcrumb.push({
      label: "Select",
    });
  } else if (state.mode === "sprite-select") {
    breadcrumb.push({
      id: "current",
      label: "Characters",
    });
    breadcrumb.push({
      id: "character-select",
      label: selectedCharacterName || "Character",
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
    breadcrumb,
    form,
    defaultValues,
    dropdownMenu: state.dropdownMenu,
  };
};
