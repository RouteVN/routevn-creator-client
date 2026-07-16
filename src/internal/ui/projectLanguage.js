import {
  normalizeProjectLanguage,
  PROJECT_LANGUAGES,
} from "../projectLanguage.js";

const OPTION_KEY_BY_LANGUAGE = Object.freeze({
  en: "englishOption",
  ja: "japaneseOption",
  "zh-Hans": "simplifiedChineseOption",
  "zh-Hant": "traditionalChineseOption",
  ko: "koreanOption",
  es: "spanishOption",
  fr: "frenchOption",
  it: "italianOption",
  pt: "portugueseOption",
  ar: "arabicOption",
  ru: "russianOption",
  uk: "ukrainianOption",
  bn: "bengaliOption",
  hi: "hindiOption",
  ur: "urduOption",
  id: "indonesianOption",
  ms: "malayOption",
  th: "thaiOption",
  vi: "vietnameseOption",
  fil: "filipinoOption",
  de: "germanOption",
  mr: "marathiOption",
  te: "teluguOption",
  tr: "turkishOption",
  ta: "tamilOption",
  fa: "persianOption",
  sw: "swahiliOption",
  ha: "hausaOption",
  "pa-Guru": "punjabiGurmukhiOption",
  gu: "gujaratiOption",
  pl: "polishOption",
  nl: "dutchOption",
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
