import {
  activateAppLocale,
  resolveAppLocale,
} from "../../internal/ui/appLocale.js";
import { selectConfigPageCopy } from "./support/configPageCopy.js";
import {
  ASSET_PACKAGE_ENABLED_CONFIG_KEY,
  isAssetPackageEnabled,
} from "../../internal/ui/releasePreferences.js";

export const handleBeforeMount = (deps) => {
  const { appService, locale, store, uiConfig } = deps;

  store.setUiConfig({ uiConfig });
  store.setAssetPackageEnabled({ enabled: isAssetPackageEnabled(appService) });
  store.setCurrentTheme({ theme: appService.getTheme() });
  store.setCurrentLocale({
    locale: resolveAppLocale({ appService, localeService: locale }),
  });
};

export const handleAfterMount = async (deps) => {
  const { appService, i18n, locale, render, store } = deps;
  const copy = selectConfigPageCopy(i18n);

  try {
    const activeLocale = await activateAppLocale({
      appService,
      localeService: locale,
      locale: resolveAppLocale({ appService, localeService: locale }),
      persist: false,
    });
    store.setCurrentLocale({ locale: activeLocale });
    render();
  } catch {
    appService.showToast({ message: copy.failedChangeLanguage });
  }
};

export const handleLanguageChange = async (deps, payload) => {
  const { appService, i18n, locale, render, store } = deps;
  const copy = selectConfigPageCopy(i18n);
  const { value: nextLocale } = payload._event.detail;
  const previousLocale = store.selectCurrentLocale();

  if (nextLocale === previousLocale) {
    return;
  }

  store.setCurrentLocale({ locale: nextLocale });
  render();

  try {
    const activeLocale = await activateAppLocale({
      appService,
      localeService: locale,
      locale: nextLocale,
    });
    if (activeLocale !== nextLocale) {
      await activateAppLocale({
        appService,
        localeService: locale,
        locale: previousLocale,
        persist: false,
      });
      throw new Error("Selected locale fell back to another locale");
    }
    render();
  } catch {
    store.setCurrentLocale({ locale: previousLocale });
    render();
    appService.showToast({ message: copy.failedChangeLanguage });
  }
};

export const handleAssetPackageChange = (deps, payload) => {
  const { appService, render, store } = deps;
  const { value: enabled } = payload._event.detail;

  appService.setUserConfig(ASSET_PACKAGE_ENABLED_CONFIG_KEY, enabled);
  store.setAssetPackageEnabled({ enabled });
  render();
};

export const handleThemeCardClick = (deps, payload) => {
  const { appService, render, store } = deps;
  const { _event } = payload;
  const theme = _event.currentTarget?.dataset?.theme;
  const currentTheme = store.selectCurrentTheme();

  if (!theme || theme === currentTheme) {
    return;
  }

  const nextTheme = appService.setTheme(theme);
  store.setCurrentTheme({ theme: nextTheme });
  render();
};
