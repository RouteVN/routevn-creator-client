import { toFlatItems } from "../project/tree.js";
import {
  getProjectLanguageTextCountMode,
  normalizeProjectLanguage,
  PROJECT_TEXT_COUNT_MODE_CHARACTER,
} from "../projectLanguage.js";
import { formatI18nCopy } from "./i18nCopy.js";

const TEXT_PART_SEPARATOR = "\n";
const FALLBACK_WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const EDITOR_CARET_TEXT = "\u200b";
const REFERENCE_DISPLAY_TEXT_PROPERTY = "__displayText";
const WHITESPACE_PATTERN = /^\s+$/u;

const segmenters = new Map();

const getSegmenter = (language, granularity) => {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    return undefined;
  }

  const key = `${language}:${granularity}`;
  if (!segmenters.has(key)) {
    segmenters.set(key, new Intl.Segmenter(language, { granularity }));
  }

  return segmenters.get(key);
};

const normalizeTextPart = (value) =>
  String(value ?? "")
    .replaceAll(EDITOR_CARET_TEXT, "")
    .replace(/\r\n?/g, "\n")
    .trim();

const toOrderedItems = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return toFlatItems(value);
  }

  return [];
};

const getReferenceDisplayText = (item = {}) => {
  const displayText = item?.reference?.[REFERENCE_DISPLAY_TEXT_PROPERTY];
  if (typeof displayText === "string" && displayText.length > 0) {
    return displayText;
  }

  const resourceId = item?.reference?.resourceId;
  return typeof resourceId === "string" && resourceId.length > 0
    ? resourceId
    : "";
};

const getContentItemPlainText = (item = {}) => {
  if (item?.reference) {
    return getReferenceDisplayText(item);
  }

  return String(item?.text ?? "");
};

const getPlainTextFromContent = (items = []) => {
  return (Array.isArray(items) ? items : [])
    .map(getContentItemPlainText)
    .join("");
};

const collectLineTextParts = (line = {}, parts) => {
  const dialogueText = normalizeTextPart(
    getPlainTextFromContent(line?.actions?.dialogue?.content),
  );
  if (dialogueText) {
    parts.push(dialogueText);
  }

  const choiceItems = line?.actions?.choice?.items;
  if (!Array.isArray(choiceItems)) {
    return;
  }

  choiceItems.forEach((item) => {
    const choiceText = normalizeTextPart(item?.content);
    if (choiceText) {
      parts.push(choiceText);
    }
  });
};

const collectSceneTextStatsInput = (scene = {}) => {
  const parts = [];
  let lineCount = 0;

  toOrderedItems(scene?.sections).forEach((section) => {
    const lines = toOrderedItems(section?.lines);
    lineCount += lines.length;
    lines.forEach((line) => {
      collectLineTextParts(line, parts);
    });
  });

  return {
    lineCount,
    text: parts.join(TEXT_PART_SEPARATOR),
  };
};

export const getSceneTextForStats = (scene = {}) =>
  collectSceneTextStatsInput(scene).text;

const countWordsWithSegmenter = (text, segmenter) => {
  let count = 0;

  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) {
      count += 1;
    }
  }

  return count;
};

const countWordsWithFallback = (text) => {
  let count = 0;

  for (const _match of text.matchAll(FALLBACK_WORD_PATTERN)) {
    count += 1;
  }

  return count;
};

const countWords = (text, language) => {
  const segmenter = getSegmenter(language, "word");
  return segmenter
    ? countWordsWithSegmenter(text, segmenter)
    : countWordsWithFallback(text);
};

const countCharactersWithSegmenter = (text, segmenter) => {
  let count = 0;

  for (const segment of segmenter.segment(text)) {
    if (!WHITESPACE_PATTERN.test(segment.segment)) {
      count += 1;
    }
  }

  return count;
};

const countCharactersWithFallback = (text) => {
  return [...text].filter((character) => !WHITESPACE_PATTERN.test(character))
    .length;
};

const countCharacters = (text, language) => {
  const segmenter = getSegmenter(language, "grapheme");
  return segmenter
    ? countCharactersWithSegmenter(text, segmenter)
    : countCharactersWithFallback(text);
};

export const createEmptySceneTextStats = () => ({
  lineCount: 0,
  wordCount: 0,
  characterCount: 0,
});

export const normalizeSceneTextStats = (stats = {}) => ({
  lineCount: Math.max(0, Math.trunc(Number(stats.lineCount) || 0)),
  wordCount: Math.max(0, Math.trunc(Number(stats.wordCount) || 0)),
  characterCount: Math.max(0, Math.trunc(Number(stats.characterCount) || 0)),
});

const formatSceneTextStatsNumber = (value) => {
  const count = Math.max(0, Math.trunc(Number(value) || 0));

  return count.toLocaleString();
};

export const getSceneTextStatsCount = (stats = {}, { language } = {}) => {
  const normalizedStats = normalizeSceneTextStats(stats);
  const countMode = getProjectLanguageTextCountMode(language);

  return countMode === PROJECT_TEXT_COUNT_MODE_CHARACTER
    ? normalizedStats.characterCount
    : normalizedStats.wordCount;
};

export const hasSceneTextStats = (stats = {}, { language } = {}) => {
  const normalizedStats = normalizeSceneTextStats(stats);
  return (
    normalizedStats.lineCount > 0 ||
    getSceneTextStatsCount(normalizedStats, { language }) > 0
  );
};

export const formatSceneTextStatsLabel = (
  stats = {},
  { language, copy = {} } = {},
) => {
  const { lineCount } = normalizeSceneTextStats(stats);
  const count = getSceneTextStatsCount(stats, { language });
  const countMode = getProjectLanguageTextCountMode(language);
  const lineTemplate =
    lineCount === 1
      ? (copy.sceneTextStatsLineLabel ?? "{count} line")
      : (copy.sceneTextStatsLinesLabel ?? "{count} lines");
  let template;
  if (countMode === PROJECT_TEXT_COUNT_MODE_CHARACTER) {
    template =
      count === 1
        ? (copy.sceneTextStatsCharacterLabel ?? "{count} character")
        : (copy.sceneTextStatsCharactersLabel ?? "{count} characters");
  } else {
    template =
      count === 1
        ? (copy.sceneTextStatsWordLabel ?? "{count} word")
        : (copy.sceneTextStatsWordsLabel ?? "{count} words");
  }

  const lineLabel = formatI18nCopy(lineTemplate, {
    count: formatSceneTextStatsNumber(lineCount),
  });
  const textCountLabel = formatI18nCopy(template, {
    count: formatSceneTextStatsNumber(count),
  });

  return `${lineLabel} ${textCountLabel}`;
};

export const buildSceneTextStats = (scene = {}, { language } = {}) => {
  const { lineCount, text } = collectSceneTextStatsInput(scene);
  const normalizedLanguage = normalizeProjectLanguage(language);

  if (!text) {
    return {
      lineCount,
      wordCount: 0,
      characterCount: 0,
    };
  }

  return {
    lineCount,
    wordCount: countWords(text, normalizedLanguage),
    characterCount: countCharacters(text, normalizedLanguage),
  };
};
