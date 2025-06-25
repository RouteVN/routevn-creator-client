import { toFlatGroups, toFlatItems } from "../../repository";

export const INITIAL_STATE = Object.freeze({
  mode: 'current',
  items: [],
  selectedCharacters: [], // Array of selected characters with their placements
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

export const addCharacter = (state, character) => {
  state.selectedCharacters.push({
    ...character,
    placement: 'center', // Default placement
    spriteId: undefined,
    spriteFileId: undefined
  });
};

export const removeCharacter = (state, index) => {
  state.selectedCharacters.splice(index, 1);
};

export const updateCharacterPlacement = (state, { index, placement }) => {
  if (state.selectedCharacters[index]) {
    state.selectedCharacters[index].placement = placement;
  }
};

export const updateCharacterSprite = (state, { index, spriteId, spriteFileId }) => {
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
  const flatItems = toFlatItems(state.items).filter(item => item.type === 'folder');
  const flatGroups = toFlatGroups(state.items)
    .map((group) => {
      return {
        ...group,
        children: group.children.map((child) => {
          const isSelected = child.id === state.tempSelectedCharacterId;
          return {
            ...child,
            bw: isSelected ? 'md' : '',
          }
        }),
      }
    });

  // Get sprite data for the selected character
  let spriteItems = [];
  let spriteGroups = [];
  let selectedCharacterName = '';
  
  if (state.mode === 'sprite-select' && state.selectedCharacterIndex !== undefined) {
    const selectedChar = state.selectedCharacters[state.selectedCharacterIndex];
    if (selectedChar && selectedChar.sprites) {
      selectedCharacterName = selectedChar.name || 'Character';
      spriteItems = toFlatItems(selectedChar.sprites).filter(item => item.type === 'folder');
      spriteGroups = toFlatGroups(selectedChar.sprites)
        .map((group) => {
          return {
            ...group,
            children: group.children.map((child) => {
              const isSelected = child.id === state.tempSelectedSpriteId;
              return {
                ...child,
                bw: isSelected ? 'md' : '',
              }
            }),
          }
        });
    }
  }

  const placementOptions = [
    { label: 'Far Left', value: 'far-left' },
    { label: 'Left', value: 'left' },
    { label: 'Center Left', value: 'center-left' },
    { label: 'Center', value: 'center' },
    { label: 'Center Right', value: 'center-right' },
    { label: 'Right', value: 'right' },
    { label: 'Far Right', value: 'far-right' }
  ];

  // Precompute character display data
  const processedSelectedCharacters = state.selectedCharacters.map(character => ({
    ...character,
    displayName: character.name || 'Unnamed Character'
  }));

  return {
    mode: state.mode,
    items: flatItems,
    groups: flatGroups,
    selectedCharacters: processedSelectedCharacters,
    placementOptions,
    spriteItems,
    spriteGroups,
    selectedCharacterName,
  };
};