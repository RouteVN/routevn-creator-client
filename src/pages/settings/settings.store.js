export const INITIAL_STATE = Object.freeze({
  resourceCategory: "settings",
  selectedResourceId: "general",
  repositoryTarget: "settings",
  flatItems: [],
});

export const toViewData = ({ state, props }) => {
  return {
    ...state,
  };
};

export const selectState = ({ state }) => {
  return state;
};
