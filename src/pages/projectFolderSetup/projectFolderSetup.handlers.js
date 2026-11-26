const errorKeys = {
  lowSpace: "lowSpaceError",
  unknownSpace: "unknownSpaceError",
  reconnect: "reconnectError",
  appFolder: "appFolderError",
  localFolder: "localFolderError",
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
  if (status.configured) {
    store.setSavedFolder({ folder: status.folder });
  }
};

export const handleSetup = async (deps) => {
  const { appService, store, render } = deps;
  const copy = store.selectCopy();
  if (store.selectIsBusy()) return;
  store.setBusy({ isBusy: true });
  render();
  let candidate;
  try {
    candidate = await appService.pickProjectFolderSetup({
      title: copy.pickerTitle,
    });
  } catch (error) {
    showSetupError(deps, error, "pickError");
    return;
  }
  if (!candidate) {
    store.setBusy({ isBusy: false });
    render();
    return;
  }
  try {
    let status = await appService.confirmProjectFolderSetup({
      uri: candidate.uri,
    });
    if (status.needsExistingConfirmation) {
      const confirmed = await appService.showDialog({
        title: copy.existingTitle,
        message: copy.existingMessage,
        confirmText: copy.useFolder,
        cancelText: copy.cancel,
      });
      if (!confirmed) {
        store.setBusy({ isBusy: false });
        render();
        return;
      }
      status = await appService.confirmProjectFolderSetup({
        uri: candidate.uri,
        acceptExisting: true,
      });
    }
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

export const handleSkip = ({ store, render }) => {
  if (store.selectIsBusy()) return;
  store.setSkipDialogOpen({ open: true });
  render();
};

export const handleCloseSkip = ({ store, render }) => {
  store.setSkipDialogOpen({ open: false });
  render();
};

export const handleStop = ({ store, render }) => {
  if (store.selectIsBusy()) return;
  store.setStopDialogOpen({ open: true });
  render();
};

export const handleCloseStop = ({ store, render }) => {
  store.setStopDialogOpen({ open: false });
  render();
};

export const handleConfirmStop = async (deps) => {
  const { appService, store, render } = deps;
  if (store.selectIsBusy()) return;
  store.setStopDialogOpen({ open: false });
  store.setBusy({ isBusy: true });
  render();
  try {
    await appService.disableBackup();
    store.setSavedFolder({ folder: undefined });
    appService.navigate("/projects", undefined, { historyMode: "replace" });
  } catch (error) {
    showSetupError(deps, error, "stopError");
  }
};

export const handleConfirmSkip = ({ appService, store, render }) => {
  store.setSkipDialogOpen({ open: false });
  render();
  if (appService.getPayload().from === "config" && appService.canGoBack()) {
    return appService.back();
  }
  appService.navigate("/projects", undefined, { historyMode: "replace" });
};
