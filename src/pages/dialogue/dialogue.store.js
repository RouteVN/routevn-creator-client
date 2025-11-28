export const createInitialState = () => ({
  selectedResourceId: undefined,
  selectedCharacterId: undefined,
});

export const setSelectedResource = (state, payload) => {
  state.selectedResourceId = payload.resourceId;
};

export const setSelectedCharacterId = (state, payload) => {
  state.selectedCharacterId = payload.characterId;
};

export const getState = ({ state }) => {
  return state;
};

export const selectViewData = ({ state }) => {
  return state;
};
