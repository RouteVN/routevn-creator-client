import { describe, expect, it } from "vitest";
import {
  getOutcomeChancePercents,
  isValidOutcomeWeight,
  MAX_RANDOM_OUTCOMES,
  toRandomAction,
  validateRandomOutcomes,
} from "../../src/internal/randomActions.js";

const outcomesWithWeights = (...weights) =>
  weights.map((weight) => ({ weight, actions: {} }));

const sectionTransition = {
  sceneId: "scene-1",
  sectionId: "section-2",
};

const updateVariableSetting = (value) => ({
  id: "update-1",
  operations: [{ variableId: "variable-1", op: "set", value }],
});

// The largest Random action, in bytes of JSON, that the editor saves.
const MAX_RANDOM_ACTION_BYTES = 48 * 1024;

const jsonByteLength = (value) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

// One outcome that sets a variable to `value`, the rest of whose JSON takes
// a fixed number of bytes.
const outcomeSetting = (value) => [
  { weight: 1, actions: { updateVariable: updateVariableSetting(value) } },
];

const EMPTY_OUTCOME_BYTES = jsonByteLength(toRandomAction(outcomeSetting("")));

// Three bytes in UTF-8, one character in JSON.
const MULTI_BYTE_CHARACTER = "あ";

describe("isValidOutcomeWeight", () => {
  it.each([0, 1, 0.5, 70, Number.MAX_VALUE])("accepts %s", (weight) => {
    expect(isValidOutcomeWeight(weight)).toBe(true);
  });

  it.each([
    ["a negative number", -1],
    ["minus infinity", -Infinity],
    ["infinity", Infinity],
    ["NaN", NaN],
    ["a numeric string", "70"],
    ["an empty field", undefined],
    ["null", null],
    ["a template", "${variables.weight}"],
  ])("refuses %s", (_label, weight) => {
    expect(isValidOutcomeWeight(weight)).toBe(false);
  });
});

describe("getOutcomeChancePercents", () => {
  it.each([
    ["70 and 30", [70, 30], [70, 30]],
    ["1, 2 and 3 to one decimal", [1, 2, 3], [16.7, 33.3, 50]],
    ["a weight of 0 as 0", [0, 5], [0, 100]],
    ["every weight 0 as 0", [0, 0, 0], [0, 0, 0]],
    ["no outcomes", [], []],
    [
      "the largest numbers without overflow",
      [Number.MAX_VALUE, Number.MAX_VALUE],
      [50, 50],
    ],
  ])("shows %s", (_label, weights, expected) => {
    expect(getOutcomeChancePercents(weights)).toEqual(expected);
  });

  // Below 0.1% a chance keeps two significant digits so that it never shows
  // as 0, and above 99.9% the share it is short of 100 does, so that it never
  // shows as 100.
  it.each([
    ["0.1% and 99.9% exactly, to one decimal", [1, 999], [0.1, 99.9]],
    ["just under 0.1% and just over 99.9%", [1, 1999], [0.05, 99.95]],
    ["a quarter of 0.1% and the rest", [1, 3999], [0.025, 99.975]],
    ["a tiny chance and its complement", [1, 99999], [0.001, 99.999]],
    ["a chance just below 100", [1, 1e7], [0.00001, 99.99999]],
    [
      "a chance short of 100 by less than fifteen digits show",
      [2 ** -52, 1],
      [2.2e-14, 99.99999999999997],
    ],
    ["exactly 100 for the only weight above 0", [0, 0, 7], [0, 0, 100]],
    ["exactly 100 for a single outcome", [3], [100]],
  ])("shows %s", (_label, weights, expected) => {
    expect(getOutcomeChancePercents(weights)).toEqual(expected);
  });

  it("never shows a positive chance as 0", () => {
    const [chance] = getOutcomeChancePercents([1e-6, 1]);

    expect(chance).toBe(0.0001);
  });

  it("counts a weight that is not valid as 0", () => {
    expect(getOutcomeChancePercents([undefined, -1, NaN, Infinity, 3])).toEqual(
      [0, 0, 0, 0, 100],
    );
  });
});

describe("toRandomAction", () => {
  it("leaves out the editor ids and keeps the weights and actions in order", () => {
    const updateVariable = updateVariableSetting(1);
    const outcomes = [
      {
        id: "outcome-1",
        weight: 70,
        actions: { updateVariable, sectionTransition },
      },
      { id: "outcome-2", weight: 0, actions: {} },
      { id: "outcome-3", weight: 30, actions: { sectionTransition } },
    ];

    const random = toRandomAction(outcomes);

    expect(random).toEqual({
      distribution: {
        type: "weighted",
        outcomes: [
          { weight: 70, actions: { updateVariable, sectionTransition } },
          { weight: 0, actions: {} },
          { weight: 30, actions: { sectionTransition } },
        ],
      },
    });
    expect(Object.keys(random.distribution.outcomes[0])).toEqual([
      "weight",
      "actions",
    ]);
    expect(Object.keys(random.distribution.outcomes[0].actions)).toEqual([
      "updateVariable",
      "sectionTransition",
    ]);
    // The editor's outcomes keep their ids.
    expect(outcomes.map((outcome) => outcome.id)).toEqual([
      "outcome-1",
      "outcome-2",
      "outcome-3",
    ]);
  });
});

describe("validateRandomOutcomes", () => {
  it.each([
    ["70 and 30", outcomesWithWeights(70, 30)],
    ["one weight of 0 beside a positive one", outcomesWithWeights(0, 1)],
    ["a single outcome", outcomesWithWeights(1)],
    ["fractional weights", outcomesWithWeights(0.25, 0.75)],
    [
      "the largest number of outcomes",
      outcomesWithWeights(...Array(MAX_RANDOM_OUTCOMES).fill(1)),
    ],
    [
      "the smallest share Route Engine accepts",
      outcomesWithWeights(1, 2 ** -52),
    ],
  ])("accepts %s", (_label, outcomes) => {
    expect(validateRandomOutcomes(outcomes)).toBeUndefined();
  });

  it("asks for an outcome when there is none", () => {
    expect(validateRandomOutcomes([])).toBe("Please add at least one outcome.");
  });

  it.each([
    ["a negative weight", -1],
    ["an empty weight", undefined],
    ["a weight as text", "70"],
    ["an infinite weight", Infinity],
    ["NaN", NaN],
  ])("refuses %s", (_label, weight) => {
    expect(validateRandomOutcomes(outcomesWithWeights(70, weight))).toBe(
      "Each weight must be 0 or greater.",
    );
  });

  it("asks for a weight greater than 0 when every weight is 0", () => {
    expect(validateRandomOutcomes(outcomesWithWeights(0, 0))).toBe(
      "Give at least one outcome a weight greater than 0.",
    );
  });

  it("refuses more than the largest number of outcomes", () => {
    expect(
      validateRandomOutcomes(
        outcomesWithWeights(...Array(MAX_RANDOM_OUTCOMES + 1).fill(1)),
      ),
    ).toBe("A random action can have at most 100 outcomes.");
  });

  it("reports a weight that is not valid before the number of outcomes", () => {
    expect(
      validateRandomOutcomes(
        outcomesWithWeights(-1, ...Array(MAX_RANDOM_OUTCOMES).fill(1)),
      ),
    ).toBe("Each weight must be 0 or greater.");
  });

  it.each([
    ["a share of exactly 2 ** -53", outcomesWithWeights(1, 2 ** -53)],
    [
      "a weight too small to divide by the largest one",
      outcomesWithWeights(Number.MIN_VALUE, Number.MAX_VALUE),
    ],
    [
      // Route Engine compares each weight with the sum of the weights, so many
      // large weights leave a small one out even above 2 ** -53 of the largest.
      "a small weight next to many large ones",
      outcomesWithWeights(...Array(99).fill(1), 50 * 2 ** -53),
    ],
  ])("refuses %s, which Route Engine could never pick", (_label, outcomes) => {
    expect(validateRandomOutcomes(outcomes)).toBe(
      "One outcome's weight is so small compared with the largest weight that the outcome can never be picked. Raise it or set it to 0.",
    );
  });

  describe("size", () => {
    const TOO_LARGE =
      "This random action is too large to save. Use fewer outcomes, or fewer actions in them.";

    it("accepts the largest number of outcomes with a transition and a variable update each", () => {
      const outcomes = Array.from({ length: MAX_RANDOM_OUTCOMES }, () => ({
        weight: 1,
        actions: {
          sectionTransition,
          updateVariable: updateVariableSetting(1),
        },
      }));

      expect(validateRandomOutcomes(outcomes)).toBeUndefined();
    });

    it("refuses outcomes whose actions hold long text", () => {
      const outcomes = Array.from({ length: MAX_RANDOM_OUTCOMES }, () => ({
        weight: 1,
        actions: {
          updateVariable: updateVariableSetting(
            MULTI_BYTE_CHARACTER.repeat(300),
          ),
        },
      }));
      const json = JSON.stringify(toRandomAction(outcomes));

      // Twice the limit in bytes, and under it in characters.
      expect(jsonByteLength(toRandomAction(outcomes))).toBeGreaterThan(
        2 * MAX_RANDOM_ACTION_BYTES,
      );
      expect(json.length).toBeLessThan(MAX_RANDOM_ACTION_BYTES);
      expect(validateRandomOutcomes(outcomes)).toBe(TOO_LARGE);
    });

    it.each([
      ["text", "x"],
      ["multi-byte text", MULTI_BYTE_CHARACTER],
    ])(
      "accepts %s that makes the action exactly 48 KiB",
      (_label, character) => {
        const fillBytes = MAX_RANDOM_ACTION_BYTES - EMPTY_OUTCOME_BYTES;
        const characterBytes = new TextEncoder().encode(character).length;
        const value =
          character.repeat(Math.floor(fillBytes / characterBytes)) +
          "x".repeat(fillBytes % characterBytes);
        const outcomes = outcomeSetting(value);

        expect(jsonByteLength(toRandomAction(outcomes))).toBe(
          MAX_RANDOM_ACTION_BYTES,
        );
        expect(validateRandomOutcomes(outcomes)).toBeUndefined();
      },
    );

    it("refuses one byte more than 48 KiB", () => {
      const outcomes = outcomeSetting(
        "x".repeat(MAX_RANDOM_ACTION_BYTES - EMPTY_OUTCOME_BYTES + 1),
      );

      expect(jsonByteLength(toRandomAction(outcomes))).toBe(
        MAX_RANDOM_ACTION_BYTES + 1,
      );
      expect(validateRandomOutcomes(outcomes)).toBe(TOO_LARGE);
    });

    it("counts UTF-8 bytes, not characters", () => {
      const fillBytes = MAX_RANDOM_ACTION_BYTES - EMPTY_OUTCOME_BYTES + 1;
      const outcomes = outcomeSetting(
        MULTI_BYTE_CHARACTER.repeat(Math.floor(fillBytes / 3)) +
          "x".repeat(fillBytes % 3),
      );

      expect(jsonByteLength(toRandomAction(outcomes))).toBe(
        MAX_RANDOM_ACTION_BYTES + 1,
      );
      // About a third of the limit in characters.
      expect(JSON.stringify(toRandomAction(outcomes)).length).toBeLessThan(
        MAX_RANDOM_ACTION_BYTES / 2,
      );
      expect(validateRandomOutcomes(outcomes)).toBe(TOO_LARGE);
    });

    it("leaves the editor ids out of the size", () => {
      const fillBytes = MAX_RANDOM_ACTION_BYTES - EMPTY_OUTCOME_BYTES;
      const [outcome] = outcomeSetting("x".repeat(fillBytes));

      expect(
        validateRandomOutcomes([{ id: "outcome-1".repeat(100), ...outcome }]),
      ).toBeUndefined();
    });

    it("reports every other problem before the size", () => {
      const [largeOutcome] = outcomeSetting(
        "x".repeat(MAX_RANDOM_ACTION_BYTES),
      );

      expect(
        validateRandomOutcomes([largeOutcome, { weight: -1, actions: {} }]),
      ).toBe("Each weight must be 0 or greater.");
      expect(
        validateRandomOutcomes([
          { ...largeOutcome, weight: 0 },
          { weight: 0, actions: {} },
        ]),
      ).toBe("Give at least one outcome a weight greater than 0.");
      expect(
        validateRandomOutcomes([
          largeOutcome,
          { weight: 2 ** -53, actions: {} },
        ]),
      ).toBe(
        "One outcome's weight is so small compared with the largest weight that the outcome can never be picked. Raise it or set it to 0.",
      );
    });
  });
});
