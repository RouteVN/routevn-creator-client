export const INITIAL_STATE = Object.freeze({
  layouts: [],
  selectedLayoutId: "",
  characters: [],
  selectedCharacterId: "",
});

export const setLayouts = (state, layouts) => {
  state.layouts = layouts;
};

export const setSelectedLayoutId = (state, { layoutId }) => {
  state.selectedLayoutId = layoutId;
};

export const setSelectedCharacterId = (state, { characterId }) => {
  state.selectedCharacterId = characterId;
};

export const toViewData = ({ state, props }, payload) => {
  const layouts = props.layouts || [];
  const characters = props.characters || [];

  const layoutOptions = layouts.map((layout) => ({
    value: layout.id,
    label: layout.name,
  }));

  const characterOptions = characters
    .filter((character) => character.type === "character")
    .map((character) => ({
      value: character.id,
      label: character.name,
    }));

  return {
    layouts: layoutOptions,
    characters: characterOptions,
    selectedLayoutId: state.selectedLayoutId,
    selectedCharacterId: state.selectedCharacterId,
    submitDisabled: false,
  };
};
