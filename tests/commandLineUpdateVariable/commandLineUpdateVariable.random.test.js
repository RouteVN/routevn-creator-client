import { describe, expect, it, vi } from "vitest";
import * as handlers from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";
import {
  clickEvent,
  mountEditor,
  operationEvent,
  randomValueIds,
  randomValues,
  rowEvent,
  startRandomOperation,
  submittedOperations,
  valueEvent,
} from "../support/updateVariableEditor.js";

const {
  handleAddRandomValueClick,
  handleBreadcrumbClick,
  handleDropdownMenuClickItem,
  handleOperationClick,
  handleOperationContextMenu,
  handleOperationSelectChange,
  handleRandomBooleanValueChange,
  handleRandomEnumValueChange,
  handleRandomMaxInputChange,
  handleRandomMinInputChange,
  handleRandomNumberValueChange,
  handleRandomTextValueChange,
  handleRandomTypeChange,
  handleRandomWeightSelectChange,
  handleRemoveRandomValueClick,
  handleSaveOperationClick,
  handleSubmitClick,
  handleValueInputChange,
  handleVariableSelectChange,
} = handlers;

const EN_COPY = EN_I18N.commandLinePage;
const JA_COPY = JA_I18N.commandLinePage;

const range = (min, max) => ({ type: "integer", min, max });
const list = (...entries) => ({
  type: "weighted",
  values: entries.map(([value, weight]) => ({ weight, value })),
});
const randomOperation = (variableId, distribution) => ({
  variableId,
  op: "random",
  distribution,
});
const updateVariableWith = (...operations) => ({
  id: "updateDice",
  operations,
});

const save = (deps) => handleSaveOperationClick(deps, clickEvent());
const submit = (deps) => handleSubmitClick(deps, clickEvent());

// Opens the first saved operation of a mounted editor.
const openFirstOperation = (deps, state) =>
  handleOperationClick(deps, operationEvent(state.operations[0].id));

describe("commandLineUpdateVariable random operation", () => {
  describe("a new random operation", () => {
    it("starts a number variable on a range from 1 to 6, with a list of one empty value", async () => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, "dice");

      expect(state.tempOperation).toMatchObject({
        variableId: "dice",
        op: "random",
      });
      expect(state.tempOperation.random).toMatchObject({
        type: "integer",
        min: 1,
        max: 6,
      });
      expect(randomValues(state)).toEqual([{ value: undefined, weight: 1 }]);
    });

    it.each([
      [
        "a boolean variable with true and false",
        "lucky",
        [
          { value: true, weight: 1 },
          { value: false, weight: 1 },
        ],
      ],
      [
        "an enum variable with its first value",
        "mood",
        [{ value: "happy", weight: 1 }],
      ],
      [
        "a text variable with one empty value",
        "weather",
        [{ value: "", weight: 1 }],
      ],
    ])("starts %s", async (_label, variableId, values) => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, variableId);

      expect(state.tempOperation.random.type).toBe("weighted");
      expect(randomValues(state)).toEqual(values);
      const ids = randomValueIds(state);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => /^[a-zA-Z0-9]+$/.test(id))).toBe(true);
    });

    it("saves the default range and submits exactly variableId, op and distribution", async () => {
      const { deps, dispatchedEvents, state } = await mountEditor();

      startRandomOperation(deps, "dice");
      save(deps);

      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      expect(state.mode).toBe("current");
      expect(state.operations).toEqual([
        {
          id: expect.any(String),
          variableId: "dice",
          op: "random",
          distribution: range(1, 6),
        },
      ]);

      submit(deps);

      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      const [operation] = submittedOperations(dispatchedEvents);
      expect(operation).toEqual(randomOperation("dice", range(1, 6)));
      expect(Object.keys(operation)).toEqual([
        "variableId",
        "op",
        "distribution",
      ]);
      expect(Object.keys(operation.distribution)).toEqual([
        "type",
        "min",
        "max",
      ]);
    });

    it("saves a range from its Minimum and Maximum fields", async () => {
      const { deps, dispatchedEvents } = await mountEditor();

      startRandomOperation(deps, "dice");
      handleRandomMinInputChange(deps, valueEvent(-10));
      handleRandomMaxInputChange(deps, valueEvent(2 ** 32 - 11));
      save(deps);
      submit(deps);

      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      expect(submittedOperations(dispatchedEvents)).toEqual([
        randomOperation("dice", range(-10, 2 ** 32 - 11)),
      ]);
    });

    it("saves a list of numbers as numbers, with their weights, in order", async () => {
      const { deps, dispatchedEvents, state } = await mountEditor();

      startRandomOperation(deps, "dice");
      handleRandomTypeChange(deps, valueEvent("weighted"));
      const [firstId] = randomValueIds(state);
      handleRandomNumberValueChange(deps, rowEvent(firstId, 2));
      handleRandomWeightSelectChange(deps, rowEvent(firstId, 3));
      handleAddRandomValueClick(deps, clickEvent());
      const [, secondId] = randomValueIds(state);
      handleRandomNumberValueChange(deps, rowEvent(secondId, -0.5));
      save(deps);
      submit(deps);

      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      const [operation] = submittedOperations(dispatchedEvents);
      expect(operation).toEqual(
        randomOperation("dice", list([2, 3], [-0.5, 1])),
      );
      expect(Object.keys(operation.distribution)).toEqual(["type", "values"]);
      expect(Object.keys(operation.distribution.values[0])).toEqual([
        "weight",
        "value",
      ]);
    });

    it("saves booleans as booleans", async () => {
      const { deps, dispatchedEvents, state } = await mountEditor();

      startRandomOperation(deps, "lucky");
      const [trueId, falseId] = randomValueIds(state);
      handleRandomBooleanValueChange(deps, rowEvent(trueId, "false"));
      handleRandomBooleanValueChange(deps, rowEvent(falseId, "true"));
      handleRandomWeightSelectChange(deps, rowEvent(falseId, 9));
      save(deps);
      submit(deps);

      expect(submittedOperations(dispatchedEvents)).toEqual([
        randomOperation("lucky", list([false, 1], [true, 9])),
      ]);
    });

    it("saves text and enum values", async () => {
      const { deps, dispatchedEvents, state } = await mountEditor();

      startRandomOperation(deps, "weather");
      handleRandomTextValueChange(
        deps,
        rowEvent(randomValueIds(state)[0], "sunny"),
      );
      handleAddRandomValueClick(deps, clickEvent());
      handleRandomTextValueChange(
        deps,
        rowEvent(randomValueIds(state)[1], "rain"),
      );
      save(deps);

      startRandomOperation(deps, "mood");
      handleAddRandomValueClick(deps, clickEvent());
      expect(randomValues(state)).toEqual([
        { value: "happy", weight: 1 },
        { value: "happy", weight: 1 },
      ]);
      handleRandomEnumValueChange(
        deps,
        rowEvent(randomValueIds(state)[1], "calm"),
      );
      save(deps);
      submit(deps);

      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      expect(submittedOperations(dispatchedEvents)).toEqual([
        randomOperation("weather", list(["sunny", 1], ["rain", 1])),
        randomOperation("mood", list(["happy", 1], ["calm", 1])),
      ]);
    });

    it("keeps the range and the list when switching between them", async () => {
      const { deps, dispatchedEvents, state } = await mountEditor();

      startRandomOperation(deps, "dice");
      handleRandomMinInputChange(deps, valueEvent(3));
      handleRandomTypeChange(deps, valueEvent("weighted"));
      handleRandomNumberValueChange(
        deps,
        rowEvent(randomValueIds(state)[0], 8),
      );
      handleRandomTypeChange(deps, valueEvent("integer"));

      expect(state.tempOperation.random).toMatchObject({
        type: "integer",
        min: 3,
        max: 6,
      });
      expect(randomValues(state)).toEqual([{ value: 8, weight: 1 }]);

      save(deps);
      submit(deps);
      expect(submittedOperations(dispatchedEvents)).toEqual([
        randomOperation("dice", range(3, 6)),
      ]);
    });

    it("removes the value whose button was pressed", async () => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, "lucky");
      handleAddRandomValueClick(deps, clickEvent());
      const [firstId, secondId, thirdId] = randomValueIds(state);
      const event = rowEvent(secondId);

      handleRemoveRandomValueClick(deps, event);

      expect(event._event.stopPropagation).toHaveBeenCalledOnce();
      expect(randomValueIds(state)).toEqual([firstId, thirdId]);
      expect(randomValues(state)).toEqual([
        { value: true, weight: 1 },
        { value: true, weight: 1 },
      ]);
    });

    it.each([1, 40, 100])("keeps the picked weight %s", async (weight) => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, "lucky");
      handleRandomWeightSelectChange(
        deps,
        rowEvent(randomValueIds(state)[1], weight),
      );

      expect(randomValues(state)[1].weight).toBe(weight);
      expect(randomValues(state)[0].weight).toBe(1);
    });

    it.each([
      ["Minimum", handleRandomMinInputChange, "min"],
      ["Maximum", handleRandomMaxInputChange, "max"],
    ])("keeps an empty %s field as no value", async (_label, handler, key) => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, "dice");
      handler(deps, valueEvent(null));

      expect(state.tempOperation.random[key]).toBeUndefined();
    });

    it("keeps an empty number value as no value", async () => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, "dice");
      handleRandomTypeChange(deps, valueEvent("weighted"));
      const [valueId] = randomValueIds(state);
      handleRandomNumberValueChange(deps, rowEvent(valueId, 4));
      handleRandomNumberValueChange(deps, rowEvent(valueId, null));

      expect(randomValues(state)).toEqual([{ value: undefined, weight: 1 }]);
    });

    it("adds values up to 100, then warns instead", async () => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, "weather");
      for (let count = 1; count < 100; count += 1) {
        handleAddRandomValueClick(deps, clickEvent());
      }
      expect(state.tempOperation.random.values).toHaveLength(100);
      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      const renders = deps.render.mock.calls.length;
      const event = clickEvent();

      handleAddRandomValueClick(deps, event);

      expect(event._event.stopPropagation).toHaveBeenCalledOnce();
      expect(state.tempOperation.random.values).toHaveLength(100);
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: "A random operation can have at most 100 values.",
        title: "Warning",
      });
      expect(deps.render).toHaveBeenCalledTimes(renders);
    });

    it("warns in Japanese at 100 values", async () => {
      const { deps } = await mountEditor(undefined, { i18n: JA_I18N });

      startRandomOperation(deps, "weather");
      for (let count = 0; count < 100; count += 1) {
        handleAddRandomValueClick(deps, clickEvent());
      }

      expect(JA_COPY.randomValueLimitReached).toEqual(expect.any(String));
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: JA_COPY.randomValueLimitReached,
        title: JA_COPY.Warning,
      });
    });
  });

  describe("resetting the random fields", () => {
    it("starts again from the defaults of a newly chosen variable", async () => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, "dice");
      handleRandomMinInputChange(deps, valueEvent(4));
      handleVariableSelectChange(deps, valueEvent("lucky"));

      expect(state.tempOperation).toMatchObject({
        variableId: "lucky",
        op: "set",
        random: undefined,
      });

      handleOperationSelectChange(deps, valueEvent("random"));

      expect(state.tempOperation.random.type).toBe("weighted");
      expect(randomValues(state)).toEqual([
        { value: true, weight: 1 },
        { value: false, weight: 1 },
      ]);
    });

    it("starts again from the defaults when the operation changes", async () => {
      const { deps, state } = await mountEditor();

      startRandomOperation(deps, "dice");
      handleRandomMinInputChange(deps, valueEvent(4));
      handleRandomTypeChange(deps, valueEvent("weighted"));
      handleOperationSelectChange(deps, valueEvent("increment"));

      expect(state.tempOperation.random).toBeUndefined();

      handleOperationSelectChange(deps, valueEvent("random"));

      expect(state.tempOperation.random).toMatchObject({
        type: "integer",
        min: 1,
        max: 6,
      });
    });

    it("keeps the values when Set to random is picked again", async () => {
      const { deps, dispatchedEvents, state } = await mountEditor(
        updateVariableWith(randomOperation("dice", list([2, 1], [4, 3]))),
      );

      openFirstOperation(deps, state);
      handleOperationSelectChange(deps, valueEvent("random"));

      expect(state.tempOperation.random.type).toBe("weighted");
      expect(randomValues(state)).toEqual([
        { value: 2, weight: 1 },
        { value: 4, weight: 3 },
      ]);

      save(deps);
      submit(deps);

      expect(submittedOperations(dispatchedEvents)).toEqual([
        randomOperation("dice", list([2, 1], [4, 3])),
      ]);
    });

    it("saves an operation that is no longer random without a distribution", async () => {
      const { deps, dispatchedEvents, state } = await mountEditor(
        updateVariableWith(randomOperation("dice", range(1, 6))),
      );

      openFirstOperation(deps, state);
      handleOperationSelectChange(deps, valueEvent("set"));
      handleValueInputChange(deps, valueEvent("3"));
      save(deps);
      submit(deps);

      expect(state.operations[0].distribution).toBeUndefined();
      expect(submittedOperations(dispatchedEvents)).toEqual([
        { variableId: "dice", op: "set", value: 3 },
      ]);
    });
  });

  describe("an existing random operation", () => {
    it.each([
      ["a range", "dice", range(-3, 10)],
      ["a list of numbers", "dice", list([2, 3], [4, 0], [2, 1.5])],
      ["booleans", "lucky", list([false, 2], [true, 1])],
      ["text", "weather", list(["sunny", 60], ["rain", 30], ["", 10])],
      ["enum values", "mood", list(["sad", 1], ["happy", 4])],
      ["a value outside the enum values", "mood", list(["angry", 1])],
      ["no values", "weather", list()],
    ])("opens %s as it was saved", async (_label, variableId, distribution) => {
      const { deps, state } = await mountEditor(
        updateVariableWith(randomOperation(variableId, distribution)),
      );

      openFirstOperation(deps, state);

      expect(state.mode).toBe("edit");
      expect(state.tempOperation).toMatchObject({ variableId, op: "random" });
      const { random } = state.tempOperation;
      expect(random.type).toBe(distribution.type);
      if (distribution.type === "integer") {
        expect(random).toMatchObject({
          min: distribution.min,
          max: distribution.max,
        });
      } else {
        expect(randomValues(state)).toEqual(distribution.values);
      }
    });

    it("keeps the list of a range operation at its defaults", async () => {
      const { deps, state } = await mountEditor(
        updateVariableWith(randomOperation("dice", range(1, 20))),
      );

      openFirstOperation(deps, state);
      handleRandomTypeChange(deps, valueEvent("weighted"));

      expect(randomValues(state)).toEqual([{ value: undefined, weight: 1 }]);
    });

    it("keeps the range of a list operation at 1 to 6", async () => {
      const { deps, state } = await mountEditor(
        updateVariableWith(randomOperation("dice", list([2, 1]))),
      );

      openFirstOperation(deps, state);
      handleRandomTypeChange(deps, valueEvent("integer"));

      expect(state.tempOperation.random).toMatchObject({ min: 1, max: 6 });
    });

    it("saves and submits an opened operation unchanged", async () => {
      const operations = [
        randomOperation("dice", range(-3, 10)),
        randomOperation("weather", list(["sunny", 60], ["rain", 40])),
        { variableId: "dice", op: "increment", value: 2 },
      ];
      const { deps, dispatchedEvents, state } = await mountEditor(
        updateVariableWith(...structuredClone(operations)),
      );

      openFirstOperation(deps, state);
      save(deps);
      handleOperationClick(deps, operationEvent(state.operations[1].id));
      save(deps);
      submit(deps);

      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      expect(dispatchedEvents.at(-1).detail).toEqual({
        updateVariable: { id: "updateDice", operations },
      });
    });

    it("discards the draft when Update Variable in the breadcrumb is clicked", async () => {
      const { deps, dispatchedEvents, state } = await mountEditor(
        updateVariableWith(randomOperation("dice", range(1, 6))),
      );

      openFirstOperation(deps, state);
      handleRandomMaxInputChange(deps, valueEvent(12));
      handleBreadcrumbClick(deps, { _event: { detail: { id: "current" } } });
      submit(deps);

      expect(submittedOperations(dispatchedEvents)).toEqual([
        randomOperation("dice", range(1, 6)),
      ]);
    });

    it("refuses to submit when a later saved operation is refused", async () => {
      const { deps, dispatchedEvents } = await mountEditor(
        updateVariableWith(
          randomOperation("dice", range(1, 6)),
          randomOperation("weather", list(["sunny", 0])),
        ),
      );

      submit(deps);

      expect(dispatchedEvents).toEqual([]);
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: "Give at least one value a weight greater than 0.",
        title: "Warning",
      });
    });

    it("names the first refused operation when several are refused", async () => {
      const { deps, dispatchedEvents } = await mountEditor(
        updateVariableWith(
          randomOperation("dice", range(6, 1)),
          randomOperation("weather", list(["sunny", 0])),
        ),
      );

      submit(deps);

      expect(dispatchedEvents).toEqual([]);
      expect(deps.appService.showAlert).toHaveBeenCalledOnce();
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: "Minimum can't be greater than Maximum.",
        title: "Warning",
      });
    });

    it("refuses to submit a saved list that Route Engine refuses", async () => {
      const { deps, dispatchedEvents } = await mountEditor(
        updateVariableWith(
          randomOperation("weather", list(["sunny", 0], ["rain", 0])),
        ),
      );

      submit(deps);

      expect(dispatchedEvents).toEqual([]);
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: "Give at least one value a weight greater than 0.",
        title: "Warning",
      });
    });
  });

  // Each reason Save Operation refuses a random operation, with the catalog
  // key and English text of its warning. `setUp` leaves the operation open.
  const SAVE_WARNINGS = [
    [
      "a minimum that is not whole",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "dice");
        handleRandomMinInputChange(editor.deps, valueEvent(1.5));
        return editor;
      },
      "randomRangeNotWholeNumbers",
      "Minimum and Maximum must be whole numbers.",
    ],
    [
      "an empty maximum",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "dice");
        handleRandomMaxInputChange(editor.deps, valueEvent(null));
        return editor;
      },
      "randomRangeNotWholeNumbers",
      "Minimum and Maximum must be whole numbers.",
    ],
    [
      "a minimum above the maximum",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "dice");
        handleRandomMinInputChange(editor.deps, valueEvent(7));
        return editor;
      },
      "randomRangeMinAboveMax",
      "Minimum can't be greater than Maximum.",
    ],
    [
      "more than 2^32 numbers",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "dice");
        handleRandomMinInputChange(editor.deps, valueEvent(0));
        handleRandomMaxInputChange(editor.deps, valueEvent(2 ** 32));
        return editor;
      },
      "randomRangeTooLarge",
      "Minimum and Maximum can be at most 4294967295 apart.",
    ],
    [
      "no values",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "weather");
        handleRemoveRandomValueClick(
          editor.deps,
          rowEvent(randomValueIds(editor.state)[0]),
        );
        return editor;
      },
      "addRandomValueRequired",
      "Please add at least one value.",
    ],
    [
      "an empty number",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "dice");
        handleRandomTypeChange(editor.deps, valueEvent("weighted"));
        return editor;
      },
      "randomNumberValueRequired",
      "Enter a number for each value.",
    ],
    [
      "empty text",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "weather");
        return editor;
      },
      "randomTextValueRequired",
      "Enter text for each value.",
    ],
    [
      "a template in a text value",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "weather");
        handleRandomTextValueChange(
          editor.deps,
          rowEvent(randomValueIds(editor.state)[0], "Hi ${name}"),
        );
        return editor;
      },
      "randomValueTemplateSyntax",
      "Values can't contain ${ or #{.",
    ],
    [
      "a path reference in a later text value",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "weather");
        handleRandomTextValueChange(
          editor.deps,
          rowEvent(randomValueIds(editor.state)[0], "sunny"),
        );
        handleAddRandomValueClick(editor.deps, clickEvent());
        handleRandomTextValueChange(
          editor.deps,
          rowEvent(randomValueIds(editor.state)[1], "#{item.name}"),
        );
        return editor;
      },
      "randomValueTemplateSyntax",
      "Values can't contain ${ or #{.",
    ],
    [
      "_event as a text value",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "weather");
        handleRandomTextValueChange(
          editor.deps,
          rowEvent(randomValueIds(editor.state)[0], "_event"),
        );
        return editor;
      },
      "randomValueEventBinding",
      "Values can't be _event or start with _event.",
    ],
    [
      "a text value that starts with _event.",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "weather");
        handleRandomTextValueChange(
          editor.deps,
          rowEvent(randomValueIds(editor.state)[0], "_event.value"),
        );
        return editor;
      },
      "randomValueEventBinding",
      "Values can't be _event or start with _event.",
    ],
    [
      "a value outside the enum values",
      async () => {
        const editor = await mountEditor(
          updateVariableWith(randomOperation("mood", list(["angry", 1]))),
        );
        openFirstOperation(editor.deps, editor.state);
        return editor;
      },
      "randomEnumValueRequired",
      "Choose a value in each row.",
    ],
    [
      "an empty weight",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "lucky");
        handleRandomWeightSelectChange(
          editor.deps,
          rowEvent(randomValueIds(editor.state)[0], null),
        );
        return editor;
      },
      "outcomeWeightInvalid",
      "Each weight must be 0 or greater.",
    ],
    [
      "every weight 0",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "lucky");
        for (const id of randomValueIds(editor.state)) {
          handleRandomWeightSelectChange(editor.deps, rowEvent(id, 0));
        }
        return editor;
      },
      "positiveRandomValueWeightRequired",
      "Give at least one value a weight greater than 0.",
    ],
    [
      "a weight that can never be picked",
      async () => {
        const editor = await mountEditor();
        startRandomOperation(editor.deps, "lucky");
        handleRandomWeightSelectChange(
          editor.deps,
          rowEvent(randomValueIds(editor.state)[1], 2 ** -53),
        );
        return editor;
      },
      "randomValueWeightTooSmall",
      "One value's weight is so small compared with the largest weight that the value can never be picked. Raise it or set it to 0.",
    ],
    [
      "more than 100 values",
      async () => {
        const editor = await mountEditor(
          updateVariableWith(
            randomOperation("dice", list(...Array(101).fill([1, 1]))),
          ),
        );
        openFirstOperation(editor.deps, editor.state);
        return editor;
      },
      "randomValueLimitReached",
      "A random operation can have at most 100 values.",
    ],
  ];

  it.each(SAVE_WARNINGS)(
    "warns about %s and keeps the draft",
    async (_label, setUp, key, message) => {
      const { deps, state } = await setUp();
      const savedOperations = structuredClone(state.operations);
      const draft = structuredClone(state.tempOperation);
      const renders = deps.render.mock.calls.length;
      const event = clickEvent();

      handleSaveOperationClick(deps, event);

      expect(EN_COPY[key]).toBe(message);
      expect(event._event.stopPropagation).toHaveBeenCalledOnce();
      expect(deps.appService.showAlert).toHaveBeenCalledOnce();
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message,
        title: "Warning",
      });
      expect(state.mode).toBe("edit");
      expect(state.tempOperation).toEqual(draft);
      expect(state.operations).toEqual(savedOperations);
      expect(deps.render).toHaveBeenCalledTimes(renders);
    },
  );

  it.each(SAVE_WARNINGS)(
    "warns about %s in Japanese",
    async (_label, setUp, key) => {
      const { deps } = await setUp();
      deps.i18n = JA_I18N;

      handleSaveOperationClick(deps, clickEvent());

      expect(JA_COPY[key]).toEqual(expect.any(String));
      expect(JA_COPY[key]).not.toBe(EN_COPY[key]);
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: JA_COPY[key],
        title: JA_COPY.Warning,
      });
    },
  );

  // Random operations the editor cannot show in its form. Each comes after an
  // operation it can edit, which Submit still writes.
  const UNSUPPORTED_OPERATIONS = [
    ["another distribution type", randomOperation("dice", { type: "dice" })],
    ["no distribution", { variableId: "dice", op: "random" }],
    ["a range for a boolean variable", randomOperation("lucky", range(0, 1))],
    ["a range of text", randomOperation("dice", range("1", "6"))],
    [
      "a range with another field",
      randomOperation("dice", { ...range(1, 6), step: 2 }),
    ],
    [
      "values that are not a list",
      randomOperation("dice", { type: "weighted", values: {} }),
    ],
    [
      "a value entry with another field",
      randomOperation("dice", {
        type: "weighted",
        values: [{ weight: 1, value: 1, label: "One" }],
      }),
    ],
    ["a weight as text", randomOperation("dice", list([1, "1"]))],
    [
      "a text value for a number variable",
      randomOperation("dice", list(["1", 1])),
    ],
    ["a number for a text variable", randomOperation("weather", list([1, 1]))],
    ["a deleted variable", randomOperation("deleted", range(1, 6))],
    [
      "an operation with a value",
      { ...randomOperation("dice", range(1, 6)), value: 3 },
    ],
    [
      "an operation with another field",
      { ...randomOperation("weather", list(["sunny", 1])), note: "Keep" },
    ],
  ];

  it.each(UNSUPPORTED_OPERATIONS)(
    "opens %s without its fields and submits it unchanged",
    async (_label, operation) => {
      const savedOperation = structuredClone(operation);
      const { deps, dispatchedEvents, state } = await mountEditor(
        updateVariableWith(
          { variableId: "dice", op: "set", value: 1 },
          operation,
        ),
      );

      handleOperationClick(deps, operationEvent(state.operations[1].id));

      expect(state.mode).toBe("edit");
      expect(state.tempOperation.op).toBe("random");
      expect(state.tempOperation.random).toBeUndefined();

      handleBreadcrumbClick(deps, { _event: { detail: { id: "current" } } });
      submit(deps);

      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      expect(submittedOperations(dispatchedEvents)).toEqual([
        { variableId: "dice", op: "set", value: 1 },
        savedOperation,
      ]);
    },
  );

  describe("the size of the action", () => {
    // A saved Update Variable action of exactly this many bytes of JSON, with
    // one random text value made of `character`.
    const updateVariableOfSize = (bytes, character = "a") => {
      const operation = randomOperation("weather", list(["", 1]));
      const baseBytes = new TextEncoder().encode(
        JSON.stringify(updateVariableWith(operation)),
      ).length;
      const characterBytes = new TextEncoder().encode(character).length;
      operation.distribution.values[0].value = character.repeat(
        (bytes - baseBytes) / characterBytes,
      );
      return updateVariableWith(operation);
    };

    it("submits an action of up to 48 KiB", async () => {
      const updateVariable = updateVariableOfSize(48 * 1024);
      const { deps, dispatchedEvents } = await mountEditor(
        structuredClone(updateVariable),
      );

      submit(deps);

      expect(deps.appService.showAlert).not.toHaveBeenCalled();
      expect(dispatchedEvents.at(-1).detail).toEqual({ updateVariable });
    });

    it.each([
      ["one byte over 48 KiB", updateVariableOfSize(48 * 1024 + 1)],
      [
        "over 48 KiB of text in fewer characters",
        updateVariableOfSize(48 * 1024 + 2, "é"),
      ],
    ])("refuses an action %s", async (_label, updateVariable) => {
      const { deps, dispatchedEvents } = await mountEditor(updateVariable);

      submit(deps);

      expect(dispatchedEvents).toEqual([]);
      expect(EN_COPY.updateVariableActionTooLarge).toBe(
        "This Update Variable action is too large to save. Use fewer or shorter values.",
      );
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: EN_COPY.updateVariableActionTooLarge,
        title: "Warning",
      });
    });

    it("refuses a large action in Japanese", async () => {
      const { deps } = await mountEditor(updateVariableOfSize(48 * 1024 + 1), {
        i18n: JA_I18N,
      });

      submit(deps);

      expect(JA_COPY.updateVariableActionTooLarge).not.toBe(
        EN_COPY.updateVariableActionTooLarge,
      );
      expect(deps.appService.showAlert).toHaveBeenCalledWith({
        message: JA_COPY.updateVariableActionTooLarge,
        title: JA_COPY.Warning,
      });
    });
  });

  it("deletes a random operation it cannot edit from the row menu", async () => {
    const { deps, dispatchedEvents, state } = await mountEditor(
      updateVariableWith(randomOperation("lucky", range(0, 1)), {
        variableId: "dice",
        op: "set",
        value: 1,
      }),
    );

    handleOperationContextMenu(deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        currentTarget: { dataset: { operationId: state.operations[0].id } },
        preventDefault: vi.fn(),
      },
    });
    handleDropdownMenuClickItem(deps, {
      _event: { detail: { item: { value: "delete" } } },
    });
    submit(deps);

    expect(submittedOperations(dispatchedEvents)).toEqual([
      { variableId: "dice", op: "set", value: 1 },
    ]);
  });
});
