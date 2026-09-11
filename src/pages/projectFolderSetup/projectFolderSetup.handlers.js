const errorKeys = {
  unavailable: "unavailableError",
  appFolder: "appFolderError",
  localFolder: "localFolderError",
  notDirectory: "invalidFolderError",
  nameConflict: "nameConflictError",
};

const showSetupError = (deps, error, fallback) => {
  const { store, render, appService } = deps;
  const copy = store.selectCopy();
  const errorKey = errorKeys[error.code] ?? fallback;
  store.setError({ errorKey });
  render();
  appService.showToast({
    title: copy.errorTitle,
    message: copy[errorKey],
    status: "error",
  });
};

export const handleBeforeMount = ({ appService, store }) => {
  const status = appService.getProjectFolderSetup();
  store.setDeviceName({ deviceName: status.deviceName });
  if (status.configured) {
    store.setSavedFolder({ folder: status.folder });
  } else if (status.reason) {
    store.setError({
      errorKey:
        status.reason === "unavailable" ? "unavailableError" : "reconnectError",
    });
  }
};

export const handleSetup = async (deps) => {
  const { appService, store, render, i18n } = deps;
  if (store.selectIsBusy()) return;
  store.setBusy({ isBusy: true });
  render();
  try {
    const candidate = await appService.pickProjectFolderSetup({
      title: i18n.projectFolderSetupPage.pickerTitle,
    });
    if (candidate) store.setCandidate({ candidate });
    else store.setBusy({ isBusy: false });
    render();
  } catch (error) {
    showSetupError(deps, error, "pickError");
  }
};

export const handleConfirm = async (deps) => {
  const { appService, store, render } = deps;
  const candidate = store.selectCandidate();
  if (store.selectIsBusy() || !candidate) return;
  store.setBusy({ isBusy: true });
  render();
  try {
    const status = await appService.confirmProjectFolderSetup({
      uri: candidate.uri,
    });
    store.setSavedFolder({ folder: status.folder });
    render();
  } catch (error) {
    showSetupError(deps, error, "confirmError");
  }
};

export const handleContinue = ({ appService }) => {
  if (!appService.getProjectFolderSetup().configured) return;
  if (appService.getPayload().from === "config" && appService.canGoBack()) {
    return appService.back();
  }
  appService.navigate("/projects", undefined, { historyMode: "replace" });
};
