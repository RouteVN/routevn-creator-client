export const PROJECT_LANGUAGES = Object.freeze(["en", "ja", "zh-hans"]);

export const DEFAULT_PROJECT_LANGUAGE = PROJECT_LANGUAGES[0];

export const PROJECT_TEXT_COUNT_MODE_WORD = "word";
export const PROJECT_TEXT_COUNT_MODE_CHARACTER = "character";

export const PROJECT_LANGUAGE_TEXT_COUNT_MODES = Object.freeze({
  en: PROJECT_TEXT_COUNT_MODE_WORD,
  ja: PROJECT_TEXT_COUNT_MODE_CHARACTER,
  "zh-hans": PROJECT_TEXT_COUNT_MODE_CHARACTER,
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
