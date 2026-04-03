import { describe, expect, it } from "vitest";
import {
  createInitialState,
  setTempOperation,
  setVariablesData,
} from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.store.js";
import { handleVariableSelectChange } from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";

describe("commandLineUpdateVariable.handlers", () => {
  it("uses system variable types when selecting a system variable", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {},
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
            value: "_currentSaveLoadPagination",
          },
        },
      },
    );

    expect(state.tempOperation).toEqual({
      variableId: "_currentSaveLoadPagination",
      op: "",
      value: 1,
    });
  });
});
