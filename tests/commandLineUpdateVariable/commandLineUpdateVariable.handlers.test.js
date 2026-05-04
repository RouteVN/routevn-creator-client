import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setTempOperation,
  setVariablesData,
} from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.store.js";
import {
  handleEnumValueSelectChange,
  handleOperationSelectChange,
  handleVariableSelectChange,
} from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";

describe("commandLineUpdateVariable.handlers", () => {
  it("uses variable types when selecting a project variable", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            saveLoadPagination: {
              id: "saveLoadPagination",
              type: "variable",
              variableType: "number",
              name: "Save/Load Pagination",
            },
          },
          tree: [],
        },
      },
    );
    setTempOperation(
      { state },
      {
        variableId: "",
        op: "",
        value: "",
      },
    );

    handleVariableSelectChange(
      {
        store: {
          getState: () => state,
          setTempOperation: (payload) => setTempOperation({ state }, payload),
        },
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "saveLoadPagination",
          },
        },
      },
    );

    expect(state.tempOperation).toEqual({
      variableId: "saveLoadPagination",
      op: "",
      value: 1,
    });
  });

  it("shows variable type as select suffix text", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            saveLoadPagination: {
              id: "saveLoadPagination",
              type: "variable",
              variableType: "number",
              name: "Save/Load Pagination",
            },
          },
          tree: [],
        },
      },
    );

    expect(selectViewData({ state }).variableOptions).toEqual([
      {
        label: "Save/Load Pagination",
        value: "saveLoadPagination",
        suffixText: "number",
      },
    ]);
  });

  it("defaults enum variables to the first enum value", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              type: "variable",
              variableType: "string",
              name: "Mood",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [],
        },
      },
    );

    handleVariableSelectChange(
      {
        store: {
          getState: () => state,
          setTempOperation: (payload) => setTempOperation({ state }, payload),
        },
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "mood",
          },
        },
      },
    );

    expect(state.tempOperation).toEqual({
      variableId: "mood",
      op: "",
      value: "happy",
    });
  });

  it("uses enum select view data for set operations on enum variables", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              type: "variable",
              variableType: "string",
              name: "Mood",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [],
        },
      },
    );
    setTempOperation(
      { state },
      {
        variableId: "mood",
        op: "set",
        value: "happy",
      },
    );

    expect(selectViewData({ state })).toMatchObject({
      showEnumValueSelect: true,
      enumValueOptions: [
        { value: "happy", label: "happy" },
        { value: "sad", label: "sad" },
      ],
      canSaveOperation: true,
    });

    setTempOperation(
      { state },
      {
        value: "angry",
      },
    );

    expect(selectViewData({ state }).canSaveOperation).toBe(false);
  });

  it("normalizes enum set operations to a selectable enum value", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              type: "variable",
              variableType: "string",
              name: "Mood",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [],
        },
      },
    );
    setTempOperation(
      { state },
      {
        variableId: "mood",
        op: "",
        value: "angry",
      },
    );

    handleOperationSelectChange(
      {
        store: {
          getState: () => state,
          setTempOperation: (payload) => setTempOperation({ state }, payload),
        },
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "set",
          },
        },
      },
    );

    expect(state.tempOperation).toMatchObject({
      op: "set",
      value: "happy",
    });
  });

  it("updates enum values from the enum select", () => {
    const state = createInitialState();

    setTempOperation(
      { state },
      {
        variableId: "mood",
        op: "set",
        value: "happy",
      },
    );

    handleEnumValueSelectChange(
      {
        store: {
          setTempOperation: (payload) => setTempOperation({ state }, payload),
        },
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "sad",
          },
        },
      },
    );

    expect(state.tempOperation.value).toBe("sad");
  });
});
