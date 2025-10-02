export const createInitialState = () => ({
  actions: {},
  mode: "actions",
  isActionsDialogOpen: false,
});

export const selectViewData = ({ state }) => {
  const displayActions = selectDisplayActions({ state });
  return {
    mode: state.mode,
    isActionsDialogOpen: state.isActionsDialogOpen,
    displayActions,
  };
};

export const selectDisplayActions = ({ state }) => {
  const { actions } = state;
  return Object.entries(actions).map(([key, value]) => {
    return {
      name: key,
      payload: value,
    };
  });
};

export const selectAction = ({ state }) => {
  return state.actions;
};

export const updateActions = (state, payload) => {
  state.actions = {
    ...state.actions,
    ...payload,
  };
};

export const showActionsDialog = (state) => {
  state.isActionsDialogOpen = true;
};

export const hideActionsDialog = (state) => {
  state.isActionsDialogOpen = false;
};

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};
