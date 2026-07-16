export const PROJECT_LANGUAGES = Object.freeze([
  "en",
  "ja",
  "ko",
  "zh-hans",
  "zh-hant",
  "ru",
  "it",
  "de",
  "fr",
  "es",
  "nl",
  "th",
  "ms",
  "id",
  "pt",
]);

export const DEFAULT_PROJECT_LANGUAGE = PROJECT_LANGUAGES[0];

export const PROJECT_TEXT_COUNT_MODE_WORD = "word";
export const PROJECT_TEXT_COUNT_MODE_CHARACTER = "character";

export const PROJECT_LANGUAGE_TEXT_COUNT_MODES = Object.freeze({
  en: PROJECT_TEXT_COUNT_MODE_WORD,
  ja: PROJECT_TEXT_COUNT_MODE_CHARACTER,
  ko: PROJECT_TEXT_COUNT_MODE_WORD,
  "zh-hans": PROJECT_TEXT_COUNT_MODE_CHARACTER,
  "zh-hant": PROJECT_TEXT_COUNT_MODE_CHARACTER,
  ru: PROJECT_TEXT_COUNT_MODE_WORD,
  it: PROJECT_TEXT_COUNT_MODE_WORD,
  de: PROJECT_TEXT_COUNT_MODE_WORD,
  fr: PROJECT_TEXT_COUNT_MODE_WORD,
  es: PROJECT_TEXT_COUNT_MODE_WORD,
  nl: PROJECT_TEXT_COUNT_MODE_WORD,
  th: PROJECT_TEXT_COUNT_MODE_WORD,
  ms: PROJECT_TEXT_COUNT_MODE_WORD,
  id: PROJECT_TEXT_COUNT_MODE_WORD,
  pt: PROJECT_TEXT_COUNT_MODE_WORD,
});

export const normalizeProjectLanguage = (language) => {
  return PROJECT_LANGUAGES.includes(language)
    ? language
    : DEFAULT_PROJECT_LANGUAGE;
};

export const getProjectLanguageTextCountMode = (language) => {
  return PROJECT_LANGUAGE_TEXT_COUNT_MODES[normalizeProjectLanguage(language)];
};

export const requireProjectLanguage = (language) => {
  if (!PROJECT_LANGUAGES.includes(language)) {
    throw new Error("Unsupported project language.");
  }

  return language;
};
