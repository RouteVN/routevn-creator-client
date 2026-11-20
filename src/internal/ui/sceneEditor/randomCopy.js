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

// The weights the weight selects offer. A weight of 0 keeps an outcome or
// value from being picked, so that another always is, as when playtesting it.
const RANDOM_WEIGHT_CHOICES = Array.from({ length: 101 }, (_, index) => index);

/**
 * Whether a weight is one the weight selects offer: a whole number from 0 to
 * 100.
 * @param {unknown} weight
 * @returns {boolean}
 */
export const isRandomWeightChoice = (weight) =>
  Number.isInteger(weight) && weight >= 0 && weight <= 100;

/**
 * The options of a weight select: the whole numbers from 0 to 100, in the
 * locale's digits. A saved weight outside them, such as 2.5 or 250, is added in
 * order, so that the select shows it and keeps it until another is picked.
 * @param {unknown} weight - The weight the select shows
 * @param {object} [dateTime] - The `dateTime` catalog of the active locale
 * @returns {{ value: number, label: string }[]}
 */
export const getRandomWeightOptions = (weight, dateTime) => {
  const weights =
    Number.isFinite(weight) && !isRandomWeightChoice(weight)
      ? [...RANDOM_WEIGHT_CHOICES, weight].sort((a, b) => a - b)
      : RANDOM_WEIGHT_CHOICES;
  return weights.map((value) => ({
    value,
    label: formatNumber(value, dateTime),
  }));
};

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
