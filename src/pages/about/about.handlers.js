export const handleBeforeMount = (deps) => {
  const { appService, store, uiConfig, updatesEnabled } = deps;

  store.setUiConfig({ uiConfig });
  store.setUpdatesEnabled({ updatesEnabled });
  const appVersion = appService.getAppVersion();
  if (appVersion) {
    store.setAppVersion({ version: appVersion });
  }

  store.setPlatform({ platform: appService.getPlatform() });
};

export const handleDataChanged = () => {
  // Handle file explorer data changes
};

export const handleCheckForUpdates = async (deps) => {
  const { updaterService, updatesEnabled } = deps;
  if (!updatesEnabled || !updaterService) {
    return;
  }

  // Check for updates with UI feedback
  await updaterService.checkForUpdates(false);
};

export const handleClickSocialButton = async (deps, payload) => {
  const { appService, store } = deps;
  const { _event } = payload;
  const id = _event.currentTarget?.dataset?.id;
  const social = store.selectSocial({ id });
  appService.openUrl(social.href);
};
