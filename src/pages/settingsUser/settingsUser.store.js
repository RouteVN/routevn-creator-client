export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "user",
  repositoryTarget: "settings",
  flatItems: [],
});

export const selectViewData = ({ state }) => {
  return {
    ...state,
  };
};

export const selectState = ({ state }) => {
  return state;
};
