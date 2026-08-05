export const APP_LOCALE_CONFIG_KEY = "app.locale";
export const DEFAULT_APP_LOCALE = "en";

export const APP_LOCALE_OPTIONS = Object.freeze([
  Object.freeze({ value: "en", label: "English" }),
  Object.freeze({ value: "ja", label: "日本語 (Beta)" }),
  Object.freeze({ value: "zh-hans", label: "简体中文 (Beta)" }),
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

  if (persist && activeLocale === nextLocale) {
    appService?.setUserConfig?.(APP_LOCALE_CONFIG_KEY, activeLocale);
  }

  return activeLocale;
};
