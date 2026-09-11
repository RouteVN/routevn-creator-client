import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";

export const createInitialState = () => ({
  deviceName: "iPhone",
  savedFolder: undefined,
  isReconnecting: false,
  isBusy: false,
  errorKey: undefined,
});

export const selectIsBusy = ({ state }) => state.isBusy;
export const setReconnecting = ({ state }, { isReconnecting }) => {
  state.isReconnecting = isReconnecting;
};

export const setDeviceName = ({ state }, { deviceName }) => {
  state.deviceName = deviceName ?? "iPhone";
};

export const selectCopy = ({ state, i18n }) => {
  const copy = { ...i18n.projectFolderSetupPage };
  if (state.isReconnecting) {
    copy.description = copy.openDescription;
  }
  for (const key of ["description", "appFolderError", "localFolderError"]) {
    copy[key] = formatI18nCopy(copy[key], { deviceName: state.deviceName });
  }
  return copy;
};

export const setBusy = ({ state }, { isBusy }) => {
  state.isBusy = isBusy;
  state.errorKey = undefined;
};

export const setSavedFolder = ({ state }, { folder }) => {
  state.savedFolder = folder;
  state.isReconnecting = false;
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
