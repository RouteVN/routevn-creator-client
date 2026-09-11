import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";

export const createInitialState = () => ({
  deviceName: "iPhone",
  candidate: undefined,
  savedFolder: undefined,
  isBusy: false,
  errorKey: undefined,
});

export const selectIsBusy = ({ state }) => state.isBusy;
export const selectCandidate = ({ state }) => state.candidate;

export const setDeviceName = ({ state }, { deviceName }) => {
  state.deviceName = deviceName ?? "iPhone";
};

export const selectCopy = ({ state, i18n }) => {
  const copy = { ...i18n.projectFolderSetupPage };
  for (const key of ["description", "appFolderError", "localFolderError"]) {
    copy[key] = formatI18nCopy(copy[key], { deviceName: state.deviceName });
  }
  return copy;
};

export const setBusy = ({ state }, { isBusy }) => {
  state.isBusy = isBusy;
  state.errorKey = undefined;
};

export const setCandidate = ({ state }, { candidate }) => {
  state.candidate = candidate;
  state.isBusy = false;
  state.errorKey = undefined;
};

export const setSavedFolder = ({ state }, { folder }) => {
  state.savedFolder = folder;
  state.candidate = undefined;
  state.isBusy = false;
  state.errorKey = undefined;
};

export const setError = ({ state }, { errorKey }) => {
  state.errorKey = errorKey;
  state.isBusy = false;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCopy({ state, i18n });
  const hasCandidate = Boolean(state.candidate);
  const hasSavedFolder = Boolean(state.savedFolder);
  return {
    ...state,
    copy,
    hasCandidate,
    hasSavedFolder,
    title: hasCandidate
      ? copy.confirmTitle
      : hasSavedFolder
        ? copy.savedTitle
        : copy.title,
    displayPath:
      state.candidate?.displayPath ?? state.savedFolder?.displayPath ?? "",
    errorMessage: state.errorKey ? copy[state.errorKey] : "",
    setupLabel: hasCandidate || hasSavedFolder ? copy.changeFolder : copy.setup,
  };
};
