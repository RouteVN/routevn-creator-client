export const handleBeforeMount = () => {
  // Initialize about page
};

export const handleAfterMount = async (deps) => {
  const { store, render, appService } = deps;

  // Set app version from appService
  const appVersion = appService.getAppVersion();
  if (appVersion) {
    store.setAppVersion(appVersion);
  }

  render();
};

export const handleDataChanged = () => {
  // Handle file explorer data changes
};

export const handleCheckForUpdates = async (deps) => {
  const { updaterService } = deps;

  // Check for updates with UI feedback
  await updaterService.checkForUpdates(false);
};

export const handleClickSocialButton = async (deps, payload) => {
  const { appService, store } = deps;
  const { _event } = payload;
  const id = _event.target.dataset.id;
  const social = store.selectSocial({ id });
  appService.openUrl(social.href);
};
