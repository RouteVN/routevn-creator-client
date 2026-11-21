import { filter } from "rxjs";
import { withErrorDetails } from "../../internal/errorDetails.js";
import {
  APP_LOCALE_CONFIG_KEY,
  APP_LOCALE_SUGGESTION_DISMISSED_CONFIG_KEY,
  activateAppLocale,
  resolveAppLocaleSuggestion,
} from "../../internal/ui/appLocale.js";

const readSuggestedLocale = ({ appService, locale }) =>
  resolveAppLocaleSuggestion({
    storedLocale: appService.getUserConfig(APP_LOCALE_CONFIG_KEY),
    dismissed: appService.getUserConfig(
      APP_LOCALE_SUGGESTION_DISMISSED_CONFIG_KEY,
    ),
    deviceLanguages: appService.getDeviceLanguages(),
    availableLocales: locale.available(),
  });

// The box is written in the suggested language, read from that locale's own
// catalog, since the people it is for read that language best.
const loadSuggestion = async (deps) => {
  const { locale, store, render } = deps;
  const suggestedLocale = readSuggestedLocale(deps);
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
  // A language chosen, or the box closed, while the catalog loaded ends it.
  if (!copy || readSuggestedLocale(deps) !== suggestedLocale) {
    return;
  }

  store.setSuggestion({
    suggestion: {
      locale: suggestedLocale,
      message: copy.message,
      switchLabel: copy.switchButton,
      closeLabel: copy.closeButton,
      failedMessage: catalog.projectsPage.failedChangeLanguage,
      errorDetailsLabel: catalog.projectsPage.errorDetailsLabel,
    },
  });
  render();
};

export const handleBeforeMount = (deps) => {
  const { subject, store, render } = deps;
  void loadSuggestion(deps);

  // Choosing a language anywhere, such as in the Language menu, or closing
  // the box ends the suggestion.
  const subscription = subject
    .pipe(
      filter(
        ({ action, payload }) =>
          action === "app.userConfig.changed" &&
          (payload.key === APP_LOCALE_CONFIG_KEY ||
            payload.key === APP_LOCALE_SUGGESTION_DISMISSED_CONFIG_KEY),
      ),
    )
    .subscribe(() => {
      if (!store.selectSuggestion() || readSuggestedLocale(deps)) {
        return;
      }
      store.clearSuggestion();
      render();
    });

  return () => subscription.unsubscribe();
};

export const handleSwitchClick = async (deps) => {
  const { appService, locale, store, render, dispatchEvent } = deps;
  const suggestion = store.selectSuggestion();
  store.setBusy({ busy: true });
  render();

  let activeLocale;
  let switchError;
  try {
    activeLocale = await activateAppLocale({
      appService,
      localeService: locale,
      locale: suggestion.locale,
    });
  } catch (error) {
    switchError = error;
  }

  // The locale service falls back to English, without an error, when the
  // suggested catalog cannot load; nothing is saved then either.
  if (switchError || activeLocale !== suggestion.locale) {
    store.setBusy({ busy: false });
    render();
    appService.showAlert({
      message: withErrorDetails(
        suggestion.failedMessage,
        switchError,
        suggestion.errorDetailsLabel,
      ),
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
  // The choice is saved now rather than on the next autosave. A failed save
  // is reported by the user config service.
  await appService.flushUserConfig().catch(() => {});
};

export const handleCloseClick = async (deps) => {
  const { appService, store, render } = deps;
  appService.setUserConfig(APP_LOCALE_SUGGESTION_DISMISSED_CONFIG_KEY, true);
  store.clearSuggestion();
  render();
  // Closing is for good, so it is saved now rather than on the next
  // autosave. A failed save is reported by the user config service.
  await appService.flushUserConfig().catch(() => {});
};
