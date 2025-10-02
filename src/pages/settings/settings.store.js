export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "general",
  repositoryTarget: "settings",
  flatItems: [],
  appVersion: "",
});

export const selectViewData = ({ state }) => {
  return {
    ...state,
  };
};

export const selectState = ({ state }) => {
  return state;
};

export const setAppVersion = (state, version) => {
  state.appVersion = version;
};
