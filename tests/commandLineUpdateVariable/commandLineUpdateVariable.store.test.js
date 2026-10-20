import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setOperations,
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
