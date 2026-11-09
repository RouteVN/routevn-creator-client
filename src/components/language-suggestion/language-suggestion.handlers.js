import {
  APP_LOCALE_CONFIG_KEY,
  APP_LOCALE_SUGGESTION_DISMISSED_CONFIG_KEY,
  activateAppLocale,
  resolveAppLocaleSuggestion,
} from "../../internal/ui/appLocale.js";

// The box is written in the suggested language, read from that locale's own
// catalog, since the people it is for read that language best.
const loadSuggestion = async (deps) => {
  const { appService, locale, store, render } = deps;
  const suggestedLocale = resolveAppLocaleSuggestion({
    storedLocale: appService.getUserConfig(APP_LOCALE_CONFIG_KEY),
    dismissed: appService.getUserConfig(
      APP_LOCALE_SUGGESTION_DISMISSED_CONFIG_KEY,
    ),
    deviceLanguages: appService.getDeviceLanguages(),
    availableLocales: locale.available(),
  });
  if (!suggestedLocale) {
    return;
  }

  let catalog;
  try {
    catalog = await locale.load(suggestedLocale);
  } catch (error) {
    // Nothing the user started fails here; the box just does not show.
    console.warn("Could not load the suggested language", error);
    return;
  }

  const copy = catalog.languageSuggestion;
  store.setSuggestion({
    suggestion: {
      locale: suggestedLocale,
      message: copy.message,
      switchLabel: copy.switchButton,
      closeLabel: copy.closeButton,
    },
  });
  render();
};

export const handleBeforeMount = (deps) => {
  void loadSuggestion(deps);
};

export const handleSwitchClick = async (deps) => {
  const { appService, locale, store, render, dispatchEvent, i18n } = deps;
  const suggestedLocale = store.selectSuggestedLocale();
  store.setBusy({ busy: true });
  render();

  let activeLocale;
  try {
    activeLocale = await activateAppLocale({
      appService,
      localeService: locale,
      locale: suggestedLocale,
    });
  } catch {
    store.setBusy({ busy: false });
    render();
    appService.showAlert({
      message: i18n.languageSuggestion.failedSwitchMessage,
    });
    return;
  }

  store.clearSuggestion();
  render();
  dispatchEvent(
    new CustomEvent("locale-change", {
      detail: { locale: activeLocale },
    }),
  );
};

export const handleCloseClick = (deps) => {
  const { appService, store, render } = deps;
  appService.setUserConfig(APP_LOCALE_SUGGESTION_DISMISSED_CONFIG_KEY, true);
  store.clearSuggestion();
  render();
};
