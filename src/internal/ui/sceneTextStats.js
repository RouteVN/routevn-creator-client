import {
  getLineDialogueContent,
  getPlainTextFromContent,
} from "./sceneEditorLexical/contentModel.js";
import { toFlatItems } from "../project/tree.js";
import { formatI18nCopy } from "./i18nCopy.js";

const TEXT_PART_SEPARATOR = "\n";
const FALLBACK_WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

const segmenters = new Map();

const getSegmenter = (granularity) => {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    return undefined;
  }

  if (!segmenters.has(granularity)) {
    segmenters.set(granularity, new Intl.Segmenter(undefined, { granularity }));
  }

  return segmenters.get(granularity);
};

const normalizeTextPart = (value) =>
  String(value ?? "")
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

const collectLineTextParts = (line = {}, parts) => {
  const dialogueText = normalizeTextPart(
    getPlainTextFromContent(getLineDialogueContent(line)),
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

export const getSceneTextForStats = (scene = {}) => {
  const parts = [];

  toOrderedItems(scene?.sections).forEach((section) => {
    toOrderedItems(section?.lines).forEach((line) => {
      collectLineTextParts(line, parts);
    });
  });

  return parts.join(TEXT_PART_SEPARATOR);
};

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

const countWords = (text) => {
  const segmenter = getSegmenter("word");
  return segmenter
    ? countWordsWithSegmenter(text, segmenter)
    : countWordsWithFallback(text);
};

export const createEmptySceneTextStats = () => ({
  wordCount: 0,
});

export const normalizeSceneTextStats = (stats = {}) => ({
  wordCount: Math.max(0, Math.trunc(Number(stats.wordCount) || 0)),
});

const formatSceneTextStatsNumber = (value) => {
  const count = Math.max(0, Math.trunc(Number(value) || 0));

  return count.toLocaleString();
};

export const formatSceneTextStatsLabel = (stats = {}, copy = {}) => {
  const normalizedStats = normalizeSceneTextStats(stats);
  const count = normalizedStats.wordCount;
  const template =
    count === 1
      ? (copy.sceneTextStatsWordLabel ?? "{count} word")
      : (copy.sceneTextStatsWordsLabel ?? "{count} words");

  return formatI18nCopy(template, {
    count: formatSceneTextStatsNumber(count),
  });
};

export const buildSceneTextStats = (scene = {}) => {
  const text = getSceneTextForStats(scene);

  if (!text) {
    return createEmptySceneTextStats();
  }

  return {
    wordCount: countWords(text),
  };
};
