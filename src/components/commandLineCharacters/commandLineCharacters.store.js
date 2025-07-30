import { toFlatGroups, toFlatItems } from "../../deps/repository";
import { nanoid } from "nanoid";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  transforms: { tree: [], items: {} },
  animations: { tree: [], items: {} },
  selectedCharacters: [], // Array of selected characters with their transforms
  tempSelectedCharacterId: undefined,
  tempSelectedSpriteId: undefined,
  selectedCharacterIndex: undefined, // For sprite selection
  context: {},
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

export const setAnimations = (state, payload) => {
  state.animations = payload.animations;
};

export const addCharacter = (state, character) => {
  // Get the first available transform as default
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "placement",
  );
  const defaultTransform =
    transformItems.length > 0 ? transformItems[0].id : undefined;

  state.selectedCharacters.push({
    ...character,
    transform: character.transform || defaultTransform,
    spriteId: character.spriteId || undefined,
    spriteFileId: character.spriteFileId || undefined,
    // Add the new properties you requested
    spriteName: character.spriteName || "",
    animation: character.animation || "none",
  });
};

export const removeCharacter = (state, index) => {
  state.selectedCharacters.splice(index, 1);
};

export const updateCharacterTransform = (state, { index, transform }) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].transform = transform;
  }
};

export const updateCharacterSprite = (
  state,
  { index, spriteId, spriteFileId },
) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].spriteId = spriteId;
    state.selectedCharacters[index].spriteFileId = spriteFileId;
  }
};

export const updateCharacterSpriteName = (state, { index, spriteName }) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].spriteName = spriteName;
  }
};

export const updateCharacterAnimation = (state, { index, animation }) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].animation = animation;
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

export const setContext = (state, context) => {
  state.context = context;
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

const createCharactersForm = (params) => {
  const { characters, transformOptions, animationOptions } = params;

  const fields = [];

  // Create form fields for each character
  characters.forEach((character, index) => {
    // Character sprite image field - use template syntax for context
    fields.push({
      name: `char[${index}]`,
      label: `Character ${index + 1} - ${character.displayName || character.name || "Character"}`,
      inputType: "image",
      src: `\${char[${index}].src}`,
      width: 200,
      height: 200,
    });

    // Transform field
    fields.push({
      name: `char[${index}].transform`,
      label: `Transform (Placement)`,
      inputType: "select",
      options: transformOptions,
    });

    // Animation field
    fields.push({
      name: `char[${index}].animation`,
      label: `Animation`,
      inputType: "select",
      options: animationOptions,
    });
  });

  return {
    fields,
  };
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

  // Get sprite data for the selected character
  let spriteItems = [];
  let spriteGroups = [];
  let selectedCharacterName = "";

  if (
    state.mode === "sprite-select" &&
    state.selectedCharacterIndex !== undefined
  ) {
    const selectedChar = state.selectedCharacters[state.selectedCharacterIndex];
    if (selectedChar && selectedChar.sprites) {
      selectedCharacterName = selectedChar.name || "Character";
      spriteItems = toFlatItems(selectedChar.sprites).filter(
        (item) => item.type === "folder",
      );
      spriteGroups = toFlatGroups(selectedChar.sprites).map((group) => {
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

  // Get transform options from repository instead of hardcoded values
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "placement",
  );
  const transformOptions = transformItems.map((transform) => ({
    label: transform.name,
    value: transform.id,
  }));

  // Get animation options from repository instead of hardcoded values
  const animationItems = toFlatItems(state.animations).filter(
    (item) => item.type === "animation",
  );
  const animationOptions = [
    { label: "None", value: "none" },
    ...animationItems.map((animation) => ({
      label: animation.name,
      value: animation.id,
    })),
  ];

  // Precompute character display data with new properties
  const processedSelectedCharacters = state.selectedCharacters.map(
    (character) => ({
      ...character,
      displayName: character.name || "Unnamed Character",
    }),
  );

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

  // Create form configuration
  const form = createCharactersForm({
    characters: state.selectedCharacters,
    transformOptions,
    animationOptions,
  });

  // Create default values for form
  const defaultValues = {};
  state.selectedCharacters.forEach((character, index) => {
    defaultValues[`char[${index}]`] = character.spriteFileId || "";
    defaultValues[`char[${index}].transform`] =
      character.transform || transformOptions[0]?.value || "";
    defaultValues[`char[${index}].animation`] = character.animation || "none";
  });

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    selectedCharacters: processedSelectedCharacters,
    transformOptions,
    animationOptions,
    spriteItems,
    spriteGroups,
    selectedCharacterName,
    breadcrumb,
    form,
    defaultValues,
    context: state.context,
    dropdownMenu: state.dropdownMenu,
  };
};
