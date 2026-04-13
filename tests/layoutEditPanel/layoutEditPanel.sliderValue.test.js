import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { handleOptionSelected } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import { toInspectorValues } from "../../src/components/layoutEditPanel/support/layoutEditPanelViewData.js";

const createDeps = ({ values = {} } = {}) => {
  const state = createInitialState();
  setValues({ state }, { values });

  return {
    props: {
      itemType: "slider",
    },
    store: {
      selectValues: () => state.values,
      updateValueProperty: (payload) => updateValueProperty({ state }, payload),
      closePopoverForm: vi.fn(),
    },
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    state,
  };
};

describe("layoutEditPanel slider values", () => {
  it("derives the selected runtime value from slider initialValue", () => {
    const values = toInspectorValues({
      values: {
        type: "slider",
        initialValue: "${runtime.musicVolume}",
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.sliderRuntimeValueId).toBe("musicVolume");
    expect(values.sliderManualInitialValue).toBe(0);
  });

  it("updates slider initialValue when a runtime value is selected", () => {
    const deps = createDeps({
      values: {
        type: "slider",
        initialValue: 0,
        min: 0,
        max: 100,
      },
    });

    handleOptionSelected(deps, {
      _event: {
        currentTarget: {
          dataset: {
            name: "sliderRuntimeValueId",
          },
        },
        detail: {
          value: "musicVolume",
        },
      },
    });

    expect(deps.state.values.sliderRuntimeValueId).toBe("musicVolume");
    expect(deps.state.values.min).toBe(0);
    expect(deps.state.values.max).toBe(500);
    expect(deps.state.values.initialValue).toBe("${runtime.musicVolume}");
    expect(
      deps.dispatchEvent.mock.calls.map(([event]) => event.detail),
    ).toEqual([
      expect.objectContaining({
        name: "max",
        value: 500,
      }),
      expect.objectContaining({
        name: "initialValue",
        value: "${runtime.musicVolume}",
      }),
    ]);
  });

  it("updates slider initialValue when the manual initial value changes", () => {
    const deps = createDeps({
      values: {
        type: "slider",
        initialValue: 0,
      },
    });

    handleOptionSelected(deps, {
      _event: {
        currentTarget: {
          dataset: {
            name: "sliderManualInitialValue",
          },
        },
        detail: {
          value: 42,
        },
      },
    });

    expect(deps.state.values.sliderManualInitialValue).toBe(42);
    expect(deps.state.values.initialValue).toBe(42);
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          name: "initialValue",
          value: 42,
        }),
      }),
    );
  });
});
