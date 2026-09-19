import {
  ROUTEVN_CONTACT_URL,
  ROUTEVN_CREATOR_APP_STORE_URL,
} from "../../internal/routevnUrls.js";
import { resolveUpdatesEnabled } from "../../internal/updates.js";

export const handleBeforeMount = (deps) => {
  const { appService, store, uiConfig } = deps;
  const platform = appService.getPlatform();

  store.setUiConfig({ uiConfig });
  store.setUpdatesEnabled({
    updatesEnabled: platform === "ios" || resolveUpdatesEnabled(deps),
  });
  const appVersion = appService.getAppVersion();
  if (appVersion) {
    store.setAppVersion({ version: appVersion });
  }

  store.setPlatform({ platform });
};

export const handleDataChanged = () => {
  // Handle file explorer data changes
};

export const handleCheckForUpdates = async (deps) => {
  const { appService, updaterService, i18n, store, render } = deps;
  if (appService.getPlatform() === "ios" && !updaterService) {
    await appService.openUrl(ROUTEVN_CREATOR_APP_STORE_URL);
    return;
  }

  if (!resolveUpdatesEnabled(deps) || !updaterService) {
    store.setUpdatesEnabled({ updatesEnabled: false });
    render();
    return;
  }

  // Check for updates with UI feedback
  await updaterService.checkForUpdates(false, { copy: i18n?.appPage ?? {} });
  store.setUpdatesEnabled({ updatesEnabled: resolveUpdatesEnabled(deps) });
  render();
};

export const handleClickSocialButton = async (deps, payload) => {
  const { appService, store } = deps;
  const { _event } = payload;
  const id = _event.currentTarget?.dataset?.id;
  const social = store.selectSocial({ id });
  appService.openUrl(social.href);
};

export const handleClickContactButton = (deps) => {
  const { appService } = deps;
  appService.openUrl(ROUTEVN_CONTACT_URL);
};
