export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "user",
  repositoryTarget: "settings",
  flatItems: [],
});

export const selectViewData = ({ state, props }) => {
  return {
    ...state,
  };
};

export const selectState = ({ state }) => {
  return state;
};
