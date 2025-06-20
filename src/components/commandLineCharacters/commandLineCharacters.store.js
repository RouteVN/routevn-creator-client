import { toFlatGroups, toFlatItems } from "../../repository";

export const INITIAL_STATE = Object.freeze({
  mode: 'current',
  items: [],
  selectedCharacters: [], // Array of selected characters with their placements
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
    placement: 'center' // Default placement
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

export const clearCharacters = (state) => {
  state.selectedCharacters = [];
};

export const toViewData = ({ state, props }, payload) => {
  const flatItems = toFlatItems(state.items).filter(item => item.type === 'folder');
  const flatGroups = toFlatGroups(state.items);

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
  };
};