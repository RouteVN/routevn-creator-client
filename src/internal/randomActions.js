// Route Engine's weighted random action picks one of its outcomes in
// proportion to the outcome's weight. These are the rules the Random editor
// checks before it submits one, and the chances it shows.

/**
 * The most outcomes one Random action can hold, to keep the editor's list
 * manageable. Route Engine accepts 1000.
 */
export const MAX_RANDOM_OUTCOMES = 100;

// A line's actions are saved as one sync event, which the sync client refuses
// over 64 KiB. A Random action may take up to this many bytes of JSON, which
// leaves room for the rest of the line.
const MAX_RANDOM_ACTION_BYTES = 48 * 1024;

const textEncoder = new TextEncoder();

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

  const weights = outcomes.map((outcome) => outcome.weight);
  if (!weights.every(isValidOutcomeWeight)) {
    return "Each weight must be 0 or greater.";
  }

  if (!weights.some((weight) => weight > 0)) {
    return "Give at least one outcome a weight greater than 0.";
  }

  if (outcomes.length > MAX_RANDOM_OUTCOMES) {
    return "A random action can have at most 100 outcomes.";
  }

  const scaledWeights = scaleWeights(weights);
  const totalWeight = sum(scaledWeights);
  const hasUnreachableWeight = weights.some(
    (weight, index) =>
      weight > 0 &&
      (scaledWeights[index] === 0 ||
        scaledWeights[index] / totalWeight <= MIN_OUTCOME_CHANCE),
  );
  if (hasUnreachableWeight) {
    return "One outcome's weight is so small compared with the largest weight that the outcome can never be picked. Raise it or set it to 0.";
  }

  const randomActionBytes = textEncoder.encode(
    JSON.stringify(toRandomAction(outcomes)),
  ).length;
  if (randomActionBytes > MAX_RANDOM_ACTION_BYTES) {
    return "This random action is too large to save. Use fewer outcomes, or fewer actions in them.";
  }

  return undefined;
};
