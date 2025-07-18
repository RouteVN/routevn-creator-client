export const INITIAL_STATE = Object.freeze({
  resourceCategory: "settings",
  selectedResourceId: "general",
  repositoryTarget: "settings",
  flatItems: [],
  detailTitle: "",
  detailFields: [],
  detailEmptyMessage: "Select a setting to configure",
});

export const toViewData = ({ state, props }) => {
  return {
    ...state,
  };
};

export const selectState = ({ state }) => {
  return state;
};
