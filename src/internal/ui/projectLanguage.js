import {
  normalizeProjectLanguage,
  PROJECT_LANGUAGES,
} from "../projectLanguage.js";

const OPTION_KEY_BY_LANGUAGE = Object.freeze({
  en: "englishOption",
  te: "teluguOption",
  es: "spanishOption",
  tr: "turkishOption",
  "zh-Hans": "simplifiedChineseOption",
  ta: "tamilOption",
  "zh-Hant": "traditionalChineseOption",
  vi: "vietnameseOption",
  hi: "hindiOption",
  ko: "koreanOption",
  ar: "arabicOption",
  fa: "persianOption",
  fr: "frenchOption",
  it: "italianOption",
  pt: "portugueseOption",
  sw: "swahiliOption",
  bn: "bengaliOption",
  ha: "hausaOption",
  ru: "russianOption",
  "pa-Guru": "punjabiGurmukhiOption",
  ur: "urduOption",
  gu: "gujaratiOption",
  id: "indonesianOption",
  th: "thaiOption",
  de: "germanOption",
  fil: "filipinoOption",
  ja: "japaneseOption",
  pl: "polishOption",
  mr: "marathiOption",
  uk: "ukrainianOption",
  nl: "dutchOption",
  ms: "malayOption",
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
