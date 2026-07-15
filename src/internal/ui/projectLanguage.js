import {
  normalizeProjectLanguage,
  PROJECT_LANGUAGES,
} from "../projectLanguage.js";

const OPTION_KEY_BY_LANGUAGE = Object.freeze({
  en: "englishOption",
  ja: "japaneseOption",
  "zh-hans": "chineseOption",
});

export const selectProjectLanguageCopy = (i18n = {}) => {
  if (!i18n.projectLanguage) {
    throw new Error("projectLanguage i18n catalog is required.");
  }

  return i18n.projectLanguage;
};

export const createProjectLanguageOptions = (i18n) => {
  const copy = selectProjectLanguageCopy(i18n);
  return PROJECT_LANGUAGES.map((language) => ({
    value: language,
    label: copy[OPTION_KEY_BY_LANGUAGE[language]],
  }));
};

export const selectProjectLanguageLabel = (i18n, language) => {
  const copy = selectProjectLanguageCopy(i18n);
  const normalizedLanguage = normalizeProjectLanguage(language);
  return copy[OPTION_KEY_BY_LANGUAGE[normalizedLanguage]];
};
