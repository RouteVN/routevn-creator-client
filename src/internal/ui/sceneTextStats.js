import {
  getProjectLanguageTextCountMode,
  PROJECT_TEXT_COUNT_MODE_CHARACTER,
} from "../projectLanguage.js";
import { formatI18nCopy } from "./i18nCopy.js";
import {
  getSceneTextStatsCount,
  normalizeSceneTextStats,
} from "../sceneTextStats.js";

export * from "../sceneTextStats.js";

const formatSceneTextStatsNumber = (value, intlLocale) => {
  const count = Math.max(0, Math.trunc(Number(value) || 0));

  return count.toLocaleString(intlLocale);
};

export const formatSceneTextStatsLabel = (
  stats = {},
  { language, copy = {}, intlLocale } = {},
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
    count: formatSceneTextStatsNumber(lineCount, intlLocale),
  });
  const textCountLabel = formatI18nCopy(template, {
    count: formatSceneTextStatsNumber(count, intlLocale),
  });

  return formatI18nCopy(
    copy.sceneTextStatsSummary ?? "{lineLabel} {textCountLabel}",
    { lineLabel, textCountLabel },
  );
};
