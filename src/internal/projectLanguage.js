export const PROJECT_LANGUAGES = Object.freeze([
  "en",
  "te",
  "es",
  "tr",
  "zh-Hans",
  "ta",
  "zh-Hant",
  "vi",
  "hi",
  "ko",
  "ar",
  "fa",
  "fr",
  "it",
  "pt",
  "sw",
  "bn",
  "ha",
  "ru",
  "pa-Guru",
  "ur",
  "gu",
  "id",
  "th",
  "de",
  "fil",
  "ja",
  "pl",
  "mr",
  "uk",
  "nl",
  "ms",
]);

export const DEFAULT_PROJECT_LANGUAGE = PROJECT_LANGUAGES[0];

export const PROJECT_TEXT_COUNT_MODE_WORD = "word";
export const PROJECT_TEXT_COUNT_MODE_CHARACTER = "character";

export const PROJECT_LANGUAGE_TEXT_COUNT_MODES = Object.freeze({
  en: PROJECT_TEXT_COUNT_MODE_WORD,
  te: PROJECT_TEXT_COUNT_MODE_WORD,
  es: PROJECT_TEXT_COUNT_MODE_WORD,
  tr: PROJECT_TEXT_COUNT_MODE_WORD,
  "zh-Hans": PROJECT_TEXT_COUNT_MODE_CHARACTER,
  ta: PROJECT_TEXT_COUNT_MODE_WORD,
  "zh-Hant": PROJECT_TEXT_COUNT_MODE_CHARACTER,
  vi: PROJECT_TEXT_COUNT_MODE_WORD,
  hi: PROJECT_TEXT_COUNT_MODE_WORD,
  ko: PROJECT_TEXT_COUNT_MODE_WORD,
  ar: PROJECT_TEXT_COUNT_MODE_WORD,
  fa: PROJECT_TEXT_COUNT_MODE_WORD,
  fr: PROJECT_TEXT_COUNT_MODE_WORD,
  it: PROJECT_TEXT_COUNT_MODE_WORD,
  pt: PROJECT_TEXT_COUNT_MODE_WORD,
  sw: PROJECT_TEXT_COUNT_MODE_WORD,
  bn: PROJECT_TEXT_COUNT_MODE_WORD,
  ha: PROJECT_TEXT_COUNT_MODE_WORD,
  ru: PROJECT_TEXT_COUNT_MODE_WORD,
  "pa-Guru": PROJECT_TEXT_COUNT_MODE_WORD,
  ur: PROJECT_TEXT_COUNT_MODE_WORD,
  gu: PROJECT_TEXT_COUNT_MODE_WORD,
  id: PROJECT_TEXT_COUNT_MODE_WORD,
  th: PROJECT_TEXT_COUNT_MODE_WORD,
  de: PROJECT_TEXT_COUNT_MODE_WORD,
  fil: PROJECT_TEXT_COUNT_MODE_WORD,
  ja: PROJECT_TEXT_COUNT_MODE_CHARACTER,
  pl: PROJECT_TEXT_COUNT_MODE_WORD,
  mr: PROJECT_TEXT_COUNT_MODE_WORD,
  uk: PROJECT_TEXT_COUNT_MODE_WORD,
  nl: PROJECT_TEXT_COUNT_MODE_WORD,
  ms: PROJECT_TEXT_COUNT_MODE_WORD,
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
