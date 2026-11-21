// Route Engine's weighted random action picks one of its outcomes in
// proportion to the outcome's weight, and an updateVariable operation with
// `op: "random"` sets its variable to a drawn value. These are the rules the
// Random editor and the Update Variable editor check before they submit one,
// and the chances they show.

import { isPlainObject } from "./importPackages.js";
import {
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "./variableEnums.js";

/**
 * The most outcomes one Random action can hold, to keep the editor's list
 * manageable. Route Engine accepts 1000.
 */
export const MAX_RANDOM_OUTCOMES = 100;

// A line's actions are saved as one sync event, which the sync client refuses
// over 64 KiB. A Random or Update Variable action may take up to this many
// bytes of JSON, which leaves room for the rest of the line.
const MAX_ACTION_BYTES = 48 * 1024;

const textEncoder = new TextEncoder();

const isOverActionSizeLimit = (action) =>
  textEncoder.encode(JSON.stringify(action)).length > MAX_ACTION_BYTES;

// Route Engine refuses a positive weight whose chance is this small or
// smaller, as it could never be picked (route-engine-js 1.54.0).
const MIN_OUTCOME_CHANCE = 2 ** -53;

/**
 * Whether Route Engine accepts the weight: a finite number, 0 or greater.
 * @param {unknown} weight
 * @returns {boolean}
 */
export const isValidOutcomeWeight = (weight) =>
  Number.isFinite(weight) && weight >= 0;

// Each weight divided by the largest one, as Route Engine scales them, so that
// adding up large weights cannot overflow. All 0 when no weight is above 0.
const scaleWeights = (weights) => {
  const largestWeight = weights.reduce(
    (largest, weight) => Math.max(largest, weight),
    0,
  );
  return weights.map((weight) =>
    largestWeight > 0 ? weight / largestWeight : 0,
  );
};

const sum = (values) => values.reduce((total, value) => total + value, 0);

// Rounded to one decimal, but to two significant digits of the distance from
// 0 below 0.1% and from 100 above 99.9%, so that a positive chance never shows
// as 0 and a chance short of certain never shows as 100.
const toDisplayPercent = (percent) => {
  if (percent > 0 && percent < 0.1) {
    return Number(percent.toPrecision(2));
  }

  if (percent > 99.9 && percent < 100) {
    const missingPercent = Number((100 - percent).toPrecision(2));
    // Fifteen digits drop the noise of the subtraction, unless they would
    // round the chance up to 100.
    const roundedPercent = Number((100 - missingPercent).toPrecision(15));
    return roundedPercent < 100 ? roundedPercent : 100 - missingPercent;
  }

  return Math.round(percent * 10) / 10;
};

/**
 * The chance of each outcome in percent, as the editor shows it: its weight
 * divided by the sum of the weights. A weight that is not valid counts as 0,
 * and every chance is 0 when no weight is above 0.
 * @param {unknown[]} weights - The outcomes' weights, in order
 * @returns {number[]} Percentages, such as 33.3 for one weight in three
 */
export const getOutcomeChancePercents = (weights) => {
  const scaledWeights = scaleWeights(
    weights.map((weight) => (isValidOutcomeWeight(weight) ? weight : 0)),
  );
  const totalWeight = sum(scaledWeights);
  return scaledWeights.map((weight) =>
    totalWeight > 0 ? toDisplayPercent((weight / totalWeight) * 100) : 0,
  );
};

/**
 * The Random action that holds these outcomes, without the ids the editor
 * gives them.
 * @param {{ weight: unknown, actions: object }[]} outcomes
 * @returns {{ distribution: { type: "weighted", outcomes: object[] } }}
 */
export const toRandomAction = (outcomes) => ({
  distribution: {
    type: "weighted",
    outcomes: outcomes.map((outcome) => ({
      weight: outcome.weight,
      actions: outcome.actions,
    })),
  },
});

/**
 * The first problem Route Engine finds with the weights of a weighted
 * distribution, for the outcomes of a Random action and the values of a
 * random operation alike.
 * @param {unknown[]} weights - The weights, in order
 * @returns {"invalid"|"noPositive"|"unreachable"|undefined} "invalid" when a
 *   weight is not a number 0 or greater, "noPositive" when no weight is above
 *   0, "unreachable" when a positive weight is so small next to the largest
 *   that it could never be picked, or undefined when Route Engine accepts them
 */
export const findRandomWeightProblem = (weights) => {
  if (!weights.every(isValidOutcomeWeight)) {
    return "invalid";
  }

  if (!weights.some((weight) => weight > 0)) {
    return "noPositive";
  }

  const scaledWeights = scaleWeights(weights);
  const totalWeight = sum(scaledWeights);
  const hasUnreachableWeight = weights.some(
    (weight, index) =>
      weight > 0 &&
      (scaledWeights[index] === 0 ||
        scaledWeights[index] / totalWeight <= MIN_OUTCOME_CHANCE),
  );
  return hasUnreachableWeight ? "unreachable" : undefined;
};

/**
 * Checks a Random action's outcomes as Route Engine does, and that the action
 * is small enough to save.
 * @param {{ weight: unknown, actions: object }[]} outcomes
 * @returns {string|undefined} The English message of the first problem, or
 *   undefined when Route Engine accepts the outcomes
 */
export const validateRandomOutcomes = (outcomes) => {
  if (outcomes.length === 0) {
    return "Please add at least one outcome.";
  }

  const weightProblem = findRandomWeightProblem(
    outcomes.map((outcome) => outcome.weight),
  );
  if (weightProblem === "invalid") {
    return "Each weight must be 0 or greater.";
  }

  if (weightProblem === "noPositive") {
    return "Give at least one outcome a weight greater than 0.";
  }

  if (outcomes.length > MAX_RANDOM_OUTCOMES) {
    return "A random action can have at most 100 outcomes.";
  }

  if (weightProblem === "unreachable") {
    return "One outcome's weight is so small compared with the largest weight that the outcome can never be picked. Raise it or set it to 0.";
  }

  if (isOverActionSizeLimit(toRandomAction(outcomes))) {
    return "This random action is too large to save. Use fewer outcomes, or fewer actions in them.";
  }

  return undefined;
};

/**
 * The most values one random operation can hold, to keep the editor's list
 * manageable. Route Engine accepts 1000.
 */
export const MAX_RANDOM_VALUES = 100;

// Route Engine draws from at most 2^32 whole numbers.
const MAX_RANDOM_INTEGER_COUNT = 2 ** 32;

// Route Engine renders an action's templates before it runs the action and
// refuses a random operation that they change. Jempl, its template language,
// reads `${...}` and `#{...}` in text.
const TEMPLATE_SYNTAX = /\$\{|#\{/;

// Route Engine reads text that is `_event` or starts with `_event.` as a value
// of the event that ran the action, also when the action is not run by one.
const isEventBinding = (value) =>
  value === "_event" || value.startsWith("_event.");

/**
 * The type of a variable, as Route Engine reads it.
 * @param {{ variableType?: string }} [variable]
 * @returns {string} "number", "boolean", "string" or "object"
 */
export const getRandomVariableType = (variable) =>
  (variable?.variableType ?? "string").toLowerCase();

const hasOnlyKeys = (value, keys) =>
  Object.keys(value).every((key) => keys.includes(key));

const matchesVariableType = (value, variableType) => {
  if (variableType === "number") {
    return Number.isFinite(value);
  }
  if (variableType === "boolean") {
    return typeof value === "boolean";
  }
  if (variableType === "string") {
    return typeof value === "string";
  }
  return false;
};

/**
 * Whether the Update Variable editor can show this random operation in its
 * form, unchanged: an operation with no keys other than `variableId`, `op` and
 * `distribution`, whose distribution the editor can show.
 * @param {{ distribution?: unknown }} operation
 * @param {object} [variable] - The variable the operation sets
 * @returns {boolean}
 */
export const isEditableRandomOperation = (operation, variable) =>
  hasOnlyKeys(operation, ["variableId", "op", "distribution"]) &&
  isEditableRandomDistribution(operation.distribution, variable);

/**
 * Whether the Update Variable editor can show this random operation's
 * distribution in its form, unchanged: a range of finite numbers for a number
 * variable, or a list of values of the variable's type, each with a weight 0
 * or greater and nothing else. Whether Route Engine accepts it is checked
 * separately, by validateRandomDistribution.
 * @param {unknown} distribution
 * @param {object} [variable] - The variable the operation sets
 * @returns {boolean}
 */
export const isEditableRandomDistribution = (distribution, variable) => {
  if (!isPlainObject(distribution) || variable === undefined) {
    return false;
  }

  const variableType = getRandomVariableType(variable);
  if (distribution.type === "integer") {
    return (
      variableType === "number" &&
      hasOnlyKeys(distribution, ["type", "min", "max"]) &&
      Number.isFinite(distribution.min) &&
      Number.isFinite(distribution.max)
    );
  }

  if (distribution.type === "weighted") {
    return (
      hasOnlyKeys(distribution, ["type", "values"]) &&
      Array.isArray(distribution.values) &&
      distribution.values.every(
        (entry) =>
          isPlainObject(entry) &&
          hasOnlyKeys(entry, ["weight", "value"]) &&
          isValidOutcomeWeight(entry.weight) &&
          matchesVariableType(entry.value, variableType),
      )
    );
  }

  return false;
};

const validateRandomIntegerRange = ({ min, max }) => {
  // Route Engine takes only safe integers, which every whole number the
  // fields can usefully hold is.
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
    return "Minimum and Maximum must be whole numbers.";
  }

  if (min > max) {
    return "Minimum can't be greater than Maximum.";
  }

  if (max - min + 1 > MAX_RANDOM_INTEGER_COUNT) {
    return "Minimum and Maximum can be at most 4294967295 apart.";
  }

  return undefined;
};

const findRandomValueProblem = (value, variable) => {
  const variableType = getRandomVariableType(variable);

  if (variableType === "number") {
    return Number.isFinite(value)
      ? undefined
      : "Enter a number for each value.";
  }

  if (variableType === "boolean") {
    return typeof value === "boolean"
      ? undefined
      : "Variable operation value is invalid.";
  }

  if (variableType !== "string") {
    return "Variable operation value is invalid.";
  }

  if (isVariableEnumEnabled(variable)) {
    if (!normalizeVariableEnumValues(variable.enumValues).includes(value)) {
      return "Choose a value in each row.";
    }
  } else if (typeof value !== "string" || value === "") {
    return "Enter text for each value.";
  }

  if (TEMPLATE_SYNTAX.test(value)) {
    return "Values can't contain ${ or #{.";
  }

  if (isEventBinding(value)) {
    return "Values can't be _event or start with _event.";
  }

  return undefined;
};

const validateRandomValues = (values, variable) => {
  if (values.length === 0) {
    return "Please add at least one value.";
  }

  const valueProblem = values
    .map((entry) => findRandomValueProblem(entry.value, variable))
    .find((problem) => problem !== undefined);
  if (valueProblem) {
    return valueProblem;
  }

  const weightProblem = findRandomWeightProblem(
    values.map((entry) => entry.weight),
  );
  if (weightProblem === "invalid") {
    return "Each weight must be 0 or greater.";
  }

  if (weightProblem === "noPositive") {
    return "Give at least one value a weight greater than 0.";
  }

  if (weightProblem === "unreachable") {
    return "One value's weight is so small compared with the largest weight that the value can never be picked. Raise it or set it to 0.";
  }

  if (values.length > MAX_RANDOM_VALUES) {
    return "A random operation can have at most 100 values.";
  }

  return undefined;
};

/**
 * Checks a random operation's distribution as Route Engine does, for the
 * variable it sets. It also refuses an empty text value, a value outside the
 * variable's enum values, and more than 100 values.
 * @param {{ type: "integer", min: unknown, max: unknown } |
 *   { type: "weighted", values: { weight: unknown, value: unknown }[] }} distribution
 * @param {object} variable - The variable the operation sets
 * @returns {string|undefined} The English message of the first problem, or
 *   undefined when Route Engine accepts the distribution
 */
export const validateRandomDistribution = (distribution, variable) => {
  if (distribution.type === "integer") {
    return getRandomVariableType(variable) === "number"
      ? validateRandomIntegerRange(distribution)
      : "Variable operation value is invalid.";
  }

  return validateRandomValues(distribution.values, variable);
};

/**
 * Checks that an Update Variable action is small enough to save with its line.
 * @param {{ operations: object[] }} updateVariable
 * @returns {string|undefined} The English message, or undefined when it fits
 */
export const validateUpdateVariableSize = (updateVariable) =>
  isOverActionSizeLimit(updateVariable)
    ? "This Update Variable action is too large to save. Use fewer or shorter values."
    : undefined;
