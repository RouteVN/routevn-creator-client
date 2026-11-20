import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "route-engine-js";
import * as handlers from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";
import { constructProjectData } from "../../src/internal/project/projection.js";
import { validateRandomDistribution } from "../../src/internal/randomActions.js";
import {
  clickEvent,
  createVariables,
  mountEditor,
  randomValueIds,
  rowEvent,
  startRandomOperation,
  valueEvent,
} from "../support/updateVariableEditor.js";

const {
  handleAddRandomValueClick,
  handleRandomEnumValueChange,
  handleRandomNumberValueChange,
  handleRandomTextValueChange,
  handleRandomTypeChange,
  handleRandomWeightSelectChange,
  handleSaveOperationClick,
  handleSubmitClick,
} = handlers;

const createTreeCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

const createRepositoryState = (lineActions) => ({
  project: { resolution: { width: 1920, height: 1080 } },
  story: { initialSceneId: "scene-1" },
  variables: createVariables(),
  scenes: createTreeCollection({
    "scene-1": {
      id: "scene-1",
      type: "scene",
      name: "Scene 1",
      sections: createTreeCollection({
        "section-1": {
          id: "section-1",
          name: "Section 1",
          lines: createTreeCollection({
            "line-1": { id: "line-1", actions: lineActions },
          }),
        },
      }),
    },
  }),
});

// A random source that returns these numbers in order, as Route Engine draws
// them, and fails the test if the engine draws more.
const createRandomSource = (numbers) => {
  const queue = [...numbers];
  return {
    nextUint32: vi.fn(() => {
      if (queue.length === 0) {
        throw new Error("Route Engine drew more numbers than expected");
      }
      return queue.shift();
    }),
  };
};

// Runs the first line's actions the way the scene editor and the preview do
// when they start Route Engine on a line, and returns its story variables.
const runLine = (lineActions, randomSource) => {
  let engine;
  engine = createRouteEngine({
    randomSource,
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      }
    },
  });
  engine.init({
    initialState: {
      global: {},
      projectData: constructProjectData(createRepositoryState(lineActions)),
    },
  });
  return engine.selectSystemState().contexts.at(-1).variables;
};

const save = (deps) => handleSaveOperationClick(deps, clickEvent());

// Builds, in the editor, a random operation for each kind of variable and
// returns the Update Variable action it submits.
const buildRandomUpdateVariable = async () => {
  const { deps, dispatchedEvents, state } = await mountEditor();
  const lastRowId = () => randomValueIds(state).at(-1);

  // A die: a range from 1 to 6.
  startRandomOperation(deps, "dice");
  save(deps);

  // A list of numbers: 10, 20 or 30, as likely as each other.
  startRandomOperation(deps, "dice");
  handleRandomTypeChange(deps, valueEvent("weighted"));
  handleRandomNumberValueChange(deps, rowEvent(lastRowId(), 10));
  for (const value of [20, 30]) {
    handleAddRandomValueClick(deps, clickEvent());
    handleRandomNumberValueChange(deps, rowEvent(lastRowId(), value));
  }
  save(deps);

  // True or false, as likely as each other.
  startRandomOperation(deps, "lucky");
  save(deps);

  // Sunny, rain or storm, weighted 60, 30 and 10.
  startRandomOperation(deps, "weather");
  [
    ["sunny", 60],
    ["rain", 30],
    ["storm", 10],
  ].forEach(([value, weight], index) => {
    if (index > 0) {
      handleAddRandomValueClick(deps, clickEvent());
    }
    handleRandomTextValueChange(deps, rowEvent(lastRowId(), value));
    handleRandomWeightSelectChange(deps, rowEvent(lastRowId(), weight));
  });
  save(deps);

  // One of two enum values, as likely as each other.
  startRandomOperation(deps, "mood");
  handleAddRandomValueClick(deps, clickEvent());
  handleRandomEnumValueChange(deps, rowEvent(lastRowId(), "sad"));
  save(deps);

  handleSubmitClick(deps, clickEvent());
  expect(deps.appService.showAlert).not.toHaveBeenCalled();
  return dispatchedEvents.at(-1).detail.updateVariable;
};

// The numbers Route Engine turns into a weighted draw of `share`, from 0 up
// to but not including 1: it reads 27 bits of one number and 26 of the next.
const weightedDraw = (share) => [Math.floor(share * 2 ** 27) * 2 ** 5, 0];

describe("random variable operations in Route Engine", () => {
  it("draws each operation the editor submits into its variable", async () => {
    const updateVariable = await buildRandomUpdateVariable();
    const weighted = (...entries) => ({
      type: "weighted",
      values: entries.map(([value, weight]) => ({ weight, value })),
    });
    expect(updateVariable.operations).toEqual([
      {
        variableId: "dice",
        op: "random",
        distribution: { type: "integer", min: 1, max: 6 },
      },
      {
        variableId: "dice",
        op: "random",
        distribution: weighted([10, 1], [20, 1], [30, 1]),
      },
      {
        variableId: "lucky",
        op: "random",
        distribution: weighted([true, 1], [false, 1]),
      },
      {
        variableId: "weather",
        op: "random",
        distribution: weighted(["sunny", 60], ["rain", 30], ["storm", 10]),
      },
      {
        variableId: "mood",
        op: "random",
        distribution: weighted(["happy", 1], ["sad", 1]),
      },
    ]);
    const randomSource = createRandomSource([
      // 16 % 6 = 4, so the die shows 1 + 4.
      16,
      // The middle third of the numbers.
      ...weightedDraw(0.5),
      // The second half of true and false.
      ...weightedDraw(0.75),
      // Past 60 + 30 of the 100 weight.
      ...weightedDraw(0.95),
      // The second of the two enum values.
      ...weightedDraw(0.5),
    ]);

    // The list of numbers draws after the die, into the same variable.
    const variables = runLine({ updateVariable }, randomSource);

    expect(variables).toMatchObject({
      dice: 20,
      lucky: false,
      weather: "storm",
      mood: "sad",
    });
    expect(randomSource.nextUint32).toHaveBeenCalledTimes(9);
  });

  it.each([
    [
      "the smallest die roll and the first values",
      [
        0,
        ...weightedDraw(0),
        ...weightedDraw(0),
        ...weightedDraw(0),
        ...weightedDraw(0),
      ],
      { dice: 10, lucky: true, weather: "sunny", mood: "happy" },
    ],
    [
      "the largest die roll and the last values",
      [
        5,
        ...weightedDraw(0.99),
        ...weightedDraw(0.99),
        ...weightedDraw(0.59),
        ...weightedDraw(0.99),
      ],
      { dice: 30, lucky: false, weather: "sunny", mood: "sad" },
    ],
  ])("draws %s", async (_label, numbers, expected) => {
    const updateVariable = await buildRandomUpdateVariable();

    expect(
      runLine({ updateVariable }, createRandomSource(numbers)),
    ).toMatchObject(expected);
  });

  it("rolls a die from the range alone", async () => {
    const { deps, dispatchedEvents } = await mountEditor();
    startRandomOperation(deps, "dice");
    save(deps);
    handleSubmitClick(deps, clickEvent());
    const updateVariable = dispatchedEvents.at(-1).detail.updateVariable;

    for (const [number, roll] of [
      [0, 1],
      [5, 6],
      [16, 5],
      [2 ** 32 - 5, 6],
    ]) {
      expect(
        runLine({ updateVariable }, createRandomSource([number])).dice,
      ).toBe(roll);
    }
  });

  // What Route Engine refuses when the line runs, the editor refuses before
  // it saves. Each case names part of the engine's own error.
  it.each([
    [
      "a range that is not whole",
      "dice",
      { type: "integer", min: 1.5, max: 6 },
      "must be a safe integer",
    ],
    [
      "a minimum above the maximum",
      "dice",
      { type: "integer", min: 7, max: 6 },
      "range must contain from 1 through 4294967296 values",
    ],
    [
      "more than 2^32 numbers",
      "dice",
      { type: "integer", min: 0, max: 2 ** 32 },
      "range must contain from 1 through 4294967296 values",
    ],
    [
      "a range of text",
      "weather",
      { type: "integer", min: 1, max: 6 },
      "needs a number variable",
    ],
    [
      "no values",
      "weather",
      { type: "weighted", values: [] },
      "must contain from 1 through 1000 items",
    ],
    [
      "every weight 0",
      "weather",
      { type: "weighted", values: [{ weight: 0, value: "sunny" }] },
      "total weight must be positive",
    ],
    [
      "a weight that can never be picked",
      "dice",
      {
        type: "weighted",
        values: [
          { weight: 1, value: 1 },
          { weight: 2 ** -53, value: 2 },
        ],
      },
      "below the supported probability resolution",
    ],
    [
      "a template",
      "weather",
      { type: "weighted", values: [{ weight: 1, value: "${weather}" }] },
      "does not support templates",
    ],
    [
      "a path reference",
      "weather",
      { type: "weighted", values: [{ weight: 1, value: "#{item}" }] },
      "Path reference '#{item}'",
    ],
    [
      "_event",
      "weather",
      { type: "weighted", values: [{ weight: 1, value: "_event" }] },
      'binding "_event" requires event context',
    ],
    [
      "a value that starts with _event.",
      "weather",
      { type: "weighted", values: [{ weight: 1, value: "_event.value" }] },
      'binding "_event.value" requires event context',
    ],
    [
      "a value of another type",
      "lucky",
      { type: "weighted", values: [{ weight: 1, value: "true" }] },
      "does not match the boolean variable",
    ],
    [
      "text for a number variable",
      "dice",
      { type: "weighted", values: [{ weight: 1, value: "4" }] },
      "does not match the number variable",
    ],
  ])(
    "refuses %s, as Route Engine does",
    (_label, variableId, distribution, engineError) => {
      const updateVariable = {
        id: "update1",
        operations: [{ variableId, op: "random", distribution }],
      };

      expect(() =>
        runLine({ updateVariable }, createRandomSource(Array(4).fill(0))),
      ).toThrow(engineError);
      expect(
        validateRandomDistribution(
          distribution,
          createVariables().items[variableId],
        ),
      ).toEqual(expect.any(String));
    },
  );

  it.each(["_events", "my_event.value", "event.value", "$", "#", "{name}"])(
    "accepts the text %s, as Route Engine does",
    (value) => {
      const distribution = { type: "weighted", values: [{ weight: 1, value }] };
      const updateVariable = {
        id: "update1",
        operations: [{ variableId: "weather", op: "random", distribution }],
      };

      expect(
        validateRandomDistribution(
          distribution,
          createVariables().items.weather,
        ),
      ).toBeUndefined();
      expect(
        runLine({ updateVariable }, createRandomSource(Array(4).fill(0)))
          .weather,
      ).toBe(value);
    },
  );
});
