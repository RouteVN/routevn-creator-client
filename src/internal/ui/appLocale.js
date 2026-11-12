export const APP_LOCALE_CONFIG_KEY = "app.locale";
// Whether the "also available in" suggestion was closed. Once closed, it
// does not show again.
export const APP_LOCALE_SUGGESTION_DISMISSED_CONFIG_KEY =
  "app.localeSuggestionDismissed";
export const DEFAULT_APP_LOCALE = "en";

export const APP_LOCALE_OPTIONS = Object.freeze([
  Object.freeze({ value: "en", label: "English" }),
  Object.freeze({ value: "ja", label: "日本語 (Beta)" }),
  Object.freeze({ value: "zh-hans", label: "简体中文 (Beta)" }),
  Object.freeze({ value: "zh-hant", label: "繁體中文 (Beta)" }),
  Object.freeze({ value: "es", label: "Español (Beta)" }),
  Object.freeze({ value: "th", label: "ไทย (Beta)" }),
  Object.freeze({ value: "ru", label: "Русский (Beta)" }),
  Object.freeze({ value: "pt", label: "Português (Beta)" }),
  Object.freeze({ value: "fr", label: "Français (Beta)" }),
  Object.freeze({ value: "vi", label: "Tiếng Việt (Beta)" }),
  Object.freeze({ value: "id", label: "Bahasa Indonesia (Beta)" }),
  Object.freeze({ value: "uk", label: "Українська (Beta)" }),
  Object.freeze({ value: "it", label: "Italiano (Beta)" }),
  Object.freeze({ value: "pl", label: "Polski (Beta)" }),
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

// Regions whose Chinese is written in Simplified characters.
const SIMPLIFIED_CHINESE_REGIONS = new Set(["cn", "sg", "my"]);
// Regions whose Chinese is written in Traditional characters.
const TRADITIONAL_CHINESE_REGIONS = new Set(["tw", "hk", "mo"]);

// The app locale for a BCP 47 language tag, such as "ja" for "ja-JP",
// "zh-hans" for "zh-CN", or "zh-hant" for "zh-TW". A script subtag wins over
// the region, so "zh-Hans-HK" is Simplified Chinese.
const toAppLocale = (languageTag) => {
  const [language, ...subtags] = `${languageTag ?? ""}`
    .toLowerCase()
    .replaceAll("_", "-")
    .split("-")
    .filter(Boolean);

  if (language === "zh") {
    if (subtags.includes("hant")) {
      return "zh-hant";
    }
    if (subtags.includes("hans") || subtags.length === 0) {
      return "zh-hans";
    }
    if (subtags.some((subtag) => TRADITIONAL_CHINESE_REGIONS.has(subtag))) {
      return "zh-hant";
    }
    return subtags.some((subtag) => SIMPLIFIED_CHINESE_REGIONS.has(subtag))
      ? "zh-hans"
      : undefined;
  }

  // Older Android versions report Indonesian as "in".
  return language === "in" ? "id" : language;
};

// The app locale to suggest: the device's most preferred language, when the
// app has it and it is not the default. Choosing a language or closing the
// suggestion ends it for good. Only the first preference counts, so a device
// that lists English first gets none.
export const resolveAppLocaleSuggestion = ({
  storedLocale,
  dismissed,
  deviceLanguages = [],
  availableLocales = [],
} = {}) => {
  if (dismissed || availableLocales.includes(storedLocale)) {
    return undefined;
  }

  const locale = toAppLocale(deviceLanguages[0]);
  if (
    !locale ||
    locale === DEFAULT_APP_LOCALE ||
    !availableLocales.includes(locale)
  ) {
    return undefined;
  }

  return locale;
};
