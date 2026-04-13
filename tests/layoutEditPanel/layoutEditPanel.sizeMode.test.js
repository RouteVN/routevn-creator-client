import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { handleOptionSelected } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";

const createDeps = ({
  itemType = "container",
  values = {},
  selectedElementMetrics = {},
} = {}) => {
  const state = createInitialState();
  setValues({ state }, { values });

  return {
    props: {
      itemType,
      selectedElementMetrics,
    },
    store: {
      selectValues: () => state.values,
      updateValueProperty: (payload) => updateValueProperty({ state }, payload),
    },
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    state,
  };
};

describe("layoutEditPanel size modes", () => {
  it("sets directed container width to auto as 0", () => {
    const deps = createDeps({
      values: {
        type: "container",
        direction: "horizontal",
        width: 320,
        height: 120,
      },
    });

    handleOptionSelected(deps, {
      _event: {
        currentTarget: {
          dataset: {
            name: "widthMode",
          },
        },
        detail: {
          value: "auto",
        },
      },
    });

    expect(deps.state.values.width).toBe(0);
  });

  it("sets directed container width to fixed from measured width", () => {
    const deps = createDeps({
      values: {
        type: "container",
        direction: "horizontal",
        width: 0,
        height: 120,
      },
      selectedElementMetrics: {
        width: 286,
      },
    });

    handleOptionSelected(deps, {
      _event: {
        currentTarget: {
          dataset: {
            name: "widthMode",
          },
        },
        detail: {
          value: "fixed",
        },
      },
    });

    expect(deps.state.values.width).toBe(286);
  });

  it("sets directed container height to fixed from measured height", () => {
    const deps = createDeps({
      values: {
        type: "container",
        direction: "vertical",
        width: 120,
        height: 0,
      },
      selectedElementMetrics: {
        height: 188,
      },
    });

    handleOptionSelected(deps, {
      _event: {
        currentTarget: {
          dataset: {
            name: "heightMode",
          },
        },
        detail: {
          value: "fixed",
        },
      },
    });

    expect(deps.state.values.height).toBe(188);
  });
});
