import {
  getProjectLanguageTextCountMode,
  PROJECT_TEXT_COUNT_MODE_CHARACTER,
} from "../projectLanguage.js";
import { formatI18nCopy, formatPluralCopy } from "./i18nCopy.js";
import {
  getSceneTextStatsCount,
  normalizeSceneTextStats,
} from "../sceneTextStats.js";

export * from "../sceneTextStats.js";

const DEFAULT_SCENE_TEXT_STATS_COPY = {
  sceneTextStatsLines_one: "{count} line",
  sceneTextStatsLines_other: "{count} lines",
  sceneTextStatsWords_one: "{count} word",
  sceneTextStatsWords_other: "{count} words",
  sceneTextStatsCharacters_one: "{count} character",
  sceneTextStatsCharacters_other: "{count} characters",
};

const formatSceneTextStatsCount = (copy, key, value, dateTime) => {
  const count = Math.max(0, Math.trunc(Number(value) || 0));

  return formatPluralCopy(copy, key, count, {
    dateTime,
    replacements: { count: count.toLocaleString(dateTime.intlLocale) },
  });
};

export const formatSceneTextStatsLabel = (
  stats = {},
  { language, copy = {}, dateTime = {} } = {},
) => {
  const statsCopy = { ...DEFAULT_SCENE_TEXT_STATS_COPY, ...copy };
  const { lineCount } = normalizeSceneTextStats(stats);
  const count = getSceneTextStatsCount(stats, { language });
  const countKey =
    getProjectLanguageTextCountMode(language) ===
    PROJECT_TEXT_COUNT_MODE_CHARACTER
      ? "sceneTextStatsCharacters"
      : "sceneTextStatsWords";

  const lineLabel = formatSceneTextStatsCount(
    statsCopy,
    "sceneTextStatsLines",
    lineCount,
    dateTime,
  );
  const textCountLabel = formatSceneTextStatsCount(
    statsCopy,
    countKey,
    count,
    dateTime,
  );

  return formatI18nCopy(
    copy.sceneTextStatsSummary ?? "{lineLabel} {textCountLabel}",
    { lineLabel, textCountLabel },
  );
};
