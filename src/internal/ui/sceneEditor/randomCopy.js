import { formatList, formatNumber } from "../../dates.js";
import {
  formatCommandLineCopy,
  localizeCommandLineText,
} from "./commandLineCopy.js";

/**
 * A chance in the locale's percent template, such as "33.3%". Chances arrive
 * rounded by getOutcomeChancePercents, which can keep more digits than
 * formatPercent's two decimals, so every digit is shown.
 * @param {number} percent
 * @param {object} [dateTime] - The `dateTime` catalog of the active locale
 * @returns {string}
 */
export const formatRandomChance = (percent, dateTime = {}) =>
  (dateTime.percent ?? "{value}%").replaceAll("{value}", () =>
    formatNumber(percent, dateTime),
  );

const formatRandomValue = (value, copy, dateTime) => {
  if (typeof value === "boolean") {
    return localizeCommandLineText(value ? "True" : "False", copy);
  }

  return typeof value === "number" ? formatNumber(value, dateTime) : value;
};

/**
 * What a random operation draws from: "1 to 6" for a range, or its values in
 * order for a list, such as "sunny, rain". Pass only a distribution that
 * isEditableRandomDistribution accepts.
 * @param {object} distribution
 * @param {object} copy - The command line copy of the active locale
 * @param {object} [dateTime] - The `dateTime` catalog of the active locale
 * @returns {string}
 */
export const formatRandomDistributionSummary = (
  distribution,
  copy,
  dateTime,
) => {
  if (distribution.type === "integer") {
    return formatCommandLineCopy(
      "{min} to {max}",
      {
        min: formatNumber(distribution.min, dateTime),
        max: formatNumber(distribution.max, dateTime),
      },
      copy,
    );
  }

  return formatList(
    distribution.values.map((entry) =>
      formatRandomValue(entry.value, copy, dateTime),
    ),
    dateTime,
  );
};
