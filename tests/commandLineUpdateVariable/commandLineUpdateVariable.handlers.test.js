import { describe, expect, it } from "vitest";
import {
  createInitialState,
  setTempOperation,
  setVariablesData,
} from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.store.js";
import { handleVariableSelectChange } from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";

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
              type: "number",
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
});
