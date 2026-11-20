import { describe, expect, it } from "vitest";
import {
  addTempRandomValue,
  createInitialState,
  removeTempRandomValue,
  selectRandomDraftData,
  selectViewData,
  setCurrentEditingId,
  setOperations,
  setTempOperation,
  setTempRandomMax,
  setTempRandomMin,
  setTempRandomType,
  setTempRandomValue,
  setTempRandomValueWeight,
  setVariablesData,
} from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.store.js";
import { EN_I18N, FR_I18N, JA_I18N, PT_I18N } from "../support/i18n.js";

const createState = () => {
  const state = createInitialState();
  setVariablesData(
    { state },
    {
      variables: {
        items: {
          active: {
            id: "active",
            name: "Active",
            type: "variable",
            variableType: "boolean",
          },
          visited: {
            id: "visited",
            name: "Visited",
            type: "variable",
            variableType: "boolean",
          },
        },
        tree: [{ id: "active" }, { id: "visited" }],
      },
    },
  );
  setOperations(
    { state },
    {
      operations: [
        { id: "operation-1", variableId: "active", op: "set", value: true },
        { id: "operation-2", variableId: "visited", op: "set", value: false },
      ],
    },
  );
  return state;
};

describe("commandLineUpdateVariable.store", () => {
  it("labels each row's variable with the catalog's colon spacing", () => {
    const state = createState();
    const [operation] = selectViewData({ state, i18n: FR_I18N }).operations;

    expect(operation.variableLabel).toBe(`${operation.variableName}\u00a0:`);
    expect(
      selectViewData({ state, i18n: EN_I18N }).operations[0].variableLabel,
    ).toBe(`${operation.variableName}:`);
  });

  it("shows boolean values with the True and False labels of the value select", () => {
    const state = createState();

    const ptViewData = selectViewData({ state, i18n: PT_I18N });
    expect(
      ptViewData.operations.map((operation) => operation.displayValue),
    ).toEqual(["Verdadeiro", "Falso"]);
    expect(ptViewData.booleanOptions).toEqual([
      { value: "true", label: "Verdadeiro" },
      { value: "false", label: "Falso" },
    ]);

    const jaViewData = selectViewData({ state, i18n: JA_I18N });
    expect(
      jaViewData.operations.map((operation) => operation.displayValue),
    ).toEqual(["真", "偽"]);
    expect(
      selectViewData({ state, i18n: EN_I18N }).operations[0].displayValue,
    ).toBe("True");
  });
});

describe("commandLineUpdateVariable.store random operation", () => {
  const createRandomState = (variableType) => {
    const state = createInitialState();
    setVariablesData(
      { state },
      {
        variables: {
          items: {
            target: {
              id: "target",
              type: "variable",
              name: "Target",
              variableType,
            },
          },
          tree: [{ id: "target" }],
        },
      },
    );
    setTempOperation(
      { state },
      {
        variableId: "target",
        op: "random",
        random: {
          type: variableType === "number" ? "integer" : "weighted",
          min: 1,
          max: 6,
          values: [{ id: "v1", value: undefined, weight: 1 }],
        },
      },
    );
    return state;
  };

  it("edits the range, the type and the values of the draft", () => {
    const state = createRandomState("number");

    setTempRandomMin({ state }, { min: -2 });
    setTempRandomMax({ state }, { max: 20 });
    setTempRandomType({ state }, { type: "weighted" });
    addTempRandomValue({ state }, { id: "v2", value: 5, weight: 1 });
    setTempRandomValue({ state }, { id: "v1", value: 3 });
    setTempRandomValueWeight({ state }, { id: "v2", weight: 4 });

    expect(state.tempOperation.random).toEqual({
      type: "weighted",
      min: -2,
      max: 20,
      values: [
        { id: "v1", value: 3, weight: 1 },
        { id: "v2", value: 5, weight: 4 },
      ],
    });

    removeTempRandomValue({ state }, { id: "v1" });

    expect(state.tempOperation.random.values).toEqual([
      { id: "v2", value: 5, weight: 4 },
    ]);
    expect(selectRandomDraftData({ state })).toEqual({
      random: state.tempOperation.random,
      variable: state.variablesData.items.target,
    });
  });

  it.each([
    ["number", true, "number"],
    ["boolean", false, "boolean"],
    ["string", false, "text"],
  ])(
    "shows the random fields of a %s variable",
    (variableType, showRandomTypeControl, randomValueInputType) => {
      const viewData = selectViewData({
        state: createRandomState(variableType),
        i18n: EN_I18N,
      });

      expect(viewData).toMatchObject({
        showRandomFields: true,
        showRandomTypeControl,
        randomValueInputType,
        showValueField: false,
        showRoundToField: false,
        showEnumValueSelect: false,
        isEditingUnsupportedRandom: false,
      });
    },
  );

  it("uses the enum select for the values of an enum variable", () => {
    const state = createRandomState("string");
    state.variablesData.items.target.isEnum = true;
    state.variablesData.items.target.enumValues = ["happy", "sad"];

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      randomValueInputType: "enum",
      enumValueOptions: [
        { value: "happy", label: "happy" },
        { value: "sad", label: "sad" },
      ],
    });
  });

  it("shows the draft's values, weights and chances, with empty fields as empty", () => {
    const weightOptions = Array.from({ length: 101 }, (_, index) => ({
      value: index,
      label: String(index),
    }));
    const state = createRandomState("boolean");
    addTempRandomValue({ state }, { id: "v2", value: false, weight: 3 });
    setTempRandomValue({ state }, { id: "v1", value: true });
    addTempRandomValue({ state }, { id: "v3", value: true, weight: undefined });

    expect(selectViewData({ state, i18n: EN_I18N }).tempRandom).toEqual({
      type: "weighted",
      min: 1,
      max: 6,
      values: [
        {
          id: "v1",
          value: true,
          booleanValue: "true",
          weight: 1,
          weightOptions,
          chance: "25%",
        },
        {
          id: "v2",
          value: false,
          booleanValue: "false",
          weight: 3,
          weightOptions,
          chance: "75%",
        },
        {
          id: "v3",
          value: true,
          booleanValue: "true",
          weight: undefined,
          weightOptions,
          chance: "0%",
        },
      ],
    });

    setTempRandomMin({ state }, { min: undefined });
    expect(selectViewData({ state, i18n: EN_I18N }).tempRandom.min).toBe("");
  });

  it("shows only the notice while a random operation it cannot edit is open", () => {
    const state = createRandomState("number");
    setOperations(
      { state },
      {
        operations: [
          {
            id: "operation-1",
            variableId: "target",
            op: "random",
            distribution: { type: "dice" },
            unsupportedOperation: {
              variableId: "target",
              op: "random",
              distribution: { type: "dice" },
            },
          },
        ],
      },
    );
    setCurrentEditingId({ state }, { id: "operation-1" });
    setTempOperation({ state }, { random: undefined });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isEditingUnsupportedRandom: true,
      showRandomFields: false,
      showRandomTypeControl: false,
      tempRandom: undefined,
      unsupportedRandomLabel:
        "This random operation is saved in a format that RouteVN Creator can't edit.",
    });
    expect(
      selectViewData({ state, i18n: EN_I18N }).operations[0].displayValue,
    ).toBe("");
  });

  it("formats a range and a list of numbers with the catalog's number format", () => {
    const state = createRandomState("number");
    setOperations(
      { state },
      {
        operations: [
          {
            id: "operation-1",
            variableId: "target",
            op: "random",
            distribution: { type: "integer", min: -1, max: 1 },
          },
          {
            id: "operation-2",
            variableId: "target",
            op: "random",
            distribution: {
              type: "weighted",
              values: [
                { weight: 1, value: 1.5 },
                { weight: 1, value: 2 },
              ],
            },
          },
        ],
      },
    );

    expect(
      selectViewData({ state, i18n: FR_I18N }).operations.map(
        (operation) => operation.displayValue,
      )[1],
    ).toBe("1,5, 2");
    expect(
      selectViewData({ state, i18n: EN_I18N }).operations.map(
        (operation) => operation.displayValue,
      ),
    ).toEqual(["-1 to 1", "1.5, 2"]);
  });
});
