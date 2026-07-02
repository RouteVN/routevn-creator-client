import { resolveUpdatesEnabled } from "../../internal/updates.js";

export const handleBeforeMount = (deps) => {
  const { appService, store, uiConfig } = deps;

  store.setUiConfig({ uiConfig });
  store.setUpdatesEnabled({ updatesEnabled: resolveUpdatesEnabled(deps) });
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
  const { updaterService, i18n } = deps;
  if (!resolveUpdatesEnabled(deps) || !updaterService) {
    return;
  }

  // Check for updates with UI feedback
  await updaterService.checkForUpdates(false, { copy: i18n?.appPage ?? {} });
};

export const handleClickSocialButton = async (deps, payload) => {
  const { appService, store } = deps;
  const { _event } = payload;
  const id = _event.currentTarget?.dataset?.id;
  const social = store.selectSocial({ id });
  appService.openUrl(social.href);
};
