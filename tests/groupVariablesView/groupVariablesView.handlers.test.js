import { describe, expect, it } from "vitest";
import { handleDialogFormChange } from "../../src/components/groupVariablesView/groupVariablesView.handlers.js";
import {
  createInitialState,
  openAddDialog,
  selectDefaultValues,
  selectIsEditMode,
  updateFormValues,
} from "../../src/components/groupVariablesView/groupVariablesView.store.js";

const createDeps = (state) => {
  const setValuesCalls = [];
  let renderCount = 0;

  return {
    deps: {
      refs: {
        variableForm: {
          setValues: (payload) => {
            setValuesCalls.push(payload);
          },
        },
      },
      store: {
        selectDefaultValues: () => selectDefaultValues({ state }),
        selectIsEditMode: () => selectIsEditMode({ state }),
        updateFormValues: (payload) => updateFormValues({ state }, payload),
      },
      render: () => {
        renderCount += 1;
      },
    },
    getRenderCount: () => renderCount,
    setValuesCalls,
  };
};

describe("groupVariablesView.handlers", () => {
  it("syncs normalized defaults back into the variable form", () => {
    const state = createInitialState();
    openAddDialog({ state }, { groupId: "group-1" });
    updateFormValues(
      { state },
      {
        variableType: "number",
        default: 12,
      },
    );
    const { deps, getRenderCount, setValuesCalls } = createDeps(state);

    handleDialogFormChange(deps, {
      _event: {
        detail: {
          values: {
            name: "score",
            scope: "context",
            variableType: "string",
            default: 12,
          },
        },
      },
    });

    expect(selectDefaultValues({ state })).toMatchObject({
      variableType: "string",
      isEnum: false,
      enumValues: [],
      default: "",
    });
    expect(setValuesCalls).toEqual([
      {
        values: expect.objectContaining({
          variableType: "string",
          default: "",
        }),
      },
    ]);
    expect(getRenderCount()).toBe(1);
  });
});
