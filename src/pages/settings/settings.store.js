export const INITIAL_STATE = Object.freeze({
  resourceCategory: "settings",
  selectedResourceId: "general",
  repositoryTarget: "settings",
  flatItems: [],
  appVersion: "",
});

export const toViewData = ({ state, props }) => {
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
