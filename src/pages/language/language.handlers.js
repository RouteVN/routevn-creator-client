import {
  activateAppLocale,
  resolveAppLocale,
} from "../../internal/ui/appLocale.js";
import { selectSettingsLanguagePageCopy } from "./support/settingsLanguagePageCopy.js";

export const handleBeforeMount = (deps) => {
  const { appService, locale, store, uiConfig } = deps;

  store.setUiConfig({ uiConfig });
  store.setCurrentLocale({
    locale: resolveAppLocale({ appService, localeService: locale }),
  });
};

export const handleAfterMount = async (deps) => {
  const { appService, i18n, locale, render, store } = deps;
  const copy = selectSettingsLanguagePageCopy(i18n);

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
  const copy = selectSettingsLanguagePageCopy(i18n);
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
      store.setCurrentLocale({ locale: activeLocale });
    }
    render();
  } catch {
    store.setCurrentLocale({ locale: previousLocale });
    render();
    appService.showToast({ message: copy.failedChangeLanguage });
  }
};
