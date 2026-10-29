export const APP_LOCALE_CONFIG_KEY = "app.locale";
export const DEFAULT_APP_LOCALE = "en";

export const APP_LOCALE_OPTIONS = Object.freeze([
  Object.freeze({ value: "en", label: "English" }),
  Object.freeze({ value: "ja", label: "日本語 (Beta)" }),
  Object.freeze({ value: "zh-hans", label: "简体中文 (Beta)" }),
  Object.freeze({ value: "es", label: "Español (Beta)" }),
  Object.freeze({ value: "th", label: "ไทย (Beta)" }),
  Object.freeze({ value: "ru", label: "Русский (Beta)" }),
  Object.freeze({ value: "pt", label: "Português (Beta)" }),
  Object.freeze({ value: "fr", label: "Français (bêta)" }),
  Object.freeze({ value: "vi", label: "Tiếng Việt (beta)" }),
]);

const getAvailableAppLocales = (localeService) => {
  return (
    localeService?.available?.() ??
    APP_LOCALE_OPTIONS.map((option) => option.value)
  );
};

export const resolveAppLocale = ({ appService, localeService } = {}) => {
  const availableLocales = getAvailableAppLocales(localeService);
  const storedLocale = appService?.getUserConfig?.(APP_LOCALE_CONFIG_KEY);
  const currentLocale = localeService?.current?.();
  const locale = storedLocale ?? currentLocale ?? DEFAULT_APP_LOCALE;

  return availableLocales.includes(locale) ? locale : DEFAULT_APP_LOCALE;
};

// Update checks report the active locale and whether it came from a stored
// user choice. Both are read at check time because the locale can change
// while the app runs.
export const readAppLocaleUsage = ({ appService, localeService } = {}) => {
  const availableLocales = getAvailableAppLocales(localeService);
  const storedLocale = appService?.getUserConfig?.(APP_LOCALE_CONFIG_KEY);
  const currentLocale = localeService?.current?.();

  return {
    uiLanguage: currentLocale,
    uiLanguageSource: availableLocales.includes(storedLocale)
      ? "selected"
      : "default",
  };
};

export const activateAppLocale = async ({
  appService,
  localeService,
  locale,
  persist = true,
} = {}) => {
  const availableLocales = getAvailableAppLocales(localeService);
  const nextLocale = availableLocales.includes(locale)
    ? locale
    : DEFAULT_APP_LOCALE;

  await localeService?.set?.(nextLocale);
  const activeLocale = localeService?.current?.() ?? nextLocale;
  // App locale ids are BCP 47 tags, so the document can use them directly.
  appService?.setDocumentLanguage?.(activeLocale);

  if (persist && activeLocale === nextLocale) {
    appService?.setUserConfig?.(APP_LOCALE_CONFIG_KEY, activeLocale);
  }

  return activeLocale;
};
