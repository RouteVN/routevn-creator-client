import { toFlatGroups, toFlatItems } from "../../deps/repository";

export const INITIAL_STATE = Object.freeze({
  mode: "current",
  items: [],
  transforms: { tree: [], items: {} },
  selectedCharacters: [], // Array of selected characters with their transforms
  tempSelectedCharacterId: undefined,
  tempSelectedSpriteId: undefined,
  selectedCharacterIndex: undefined, // For sprite selection
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

export const addCharacter = (state, character) => {
  // Get the first available transform as default
  const transformItems = toFlatItems(state.transforms).filter(
    (item) => item.type === "placement",
  );
  const defaultTransform =
    transformItems.length > 0 ? transformItems[0].id : undefined;

  state.selectedCharacters.push({
    ...character,
    transform: defaultTransform,
    spriteId: undefined,
    spriteFileId: undefined,
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

  // Precompute character display data
  const processedSelectedCharacters = state.selectedCharacters.map(
    (character) => ({
      ...character,
      displayName: character.name || "Unnamed Character",
    }),
  );

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    selectedCharacters: processedSelectedCharacters,
    transformOptions,
    spriteItems,
    spriteGroups,
    selectedCharacterName,
  };
};
