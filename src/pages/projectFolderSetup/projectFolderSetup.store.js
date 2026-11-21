// The Android backup folder setup page.
export const createInitialState = () => ({
  skipDialogOpen: false,
  stopDialogOpen: false,
  savedFolder: undefined,
  isBusy: false,
  errorKey: undefined,
});

export const selectIsBusy = ({ state }) => state.isBusy;

export const selectCopy = ({ i18n }) => i18n.androidBackupSetup;

export const setBusy = ({ state }, { isBusy }) => {
  state.isBusy = isBusy;
  state.errorKey = undefined;
};

export const setSavedFolder = ({ state }, { folder }) => {
  state.savedFolder = folder;
  state.isBusy = false;
  state.errorKey = undefined;
};

export const setError = ({ state }, { errorKey }) => {
  state.errorKey = errorKey;
  state.isBusy = false;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCopy({ state, i18n });
  const hasSavedFolder = Boolean(state.savedFolder);
  return {
    ...state,
    copy,
    hasSavedFolder,
    title: hasSavedFolder ? copy.savedTitle : copy.title,
    titleSize: hasSavedFolder ? "h2" : "h3",
    displayPath: state.savedFolder?.displayPath ?? "",
    errorMessage: state.errorKey ? copy[state.errorKey] : "",
    setupLabel: hasSavedFolder ? copy.changeFolder : copy.setup,
    setupVariant: hasSavedFolder ? "ol" : "pr",
  };
};

export const setSkipDialogOpen = ({ state }, { open }) => {
  state.skipDialogOpen = open;
};

export const setStopDialogOpen = ({ state }, { open }) => {
  state.stopDialogOpen = open;
};
