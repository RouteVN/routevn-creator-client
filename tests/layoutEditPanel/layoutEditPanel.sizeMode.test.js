import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { handleOptionSelected } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";

const EMPTY_TREE = { items: {}, tree: [] };
const LAYOUT_EDIT_PANEL_CONSTANTS = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

const createDeps = ({
  itemType = "container",
  projectResolution,
  values = {},
  selectedElementMetrics = {},
} = {}) => {
  const state = createInitialState();
  setValues({ state }, { values });

  return {
    props: {
      itemType,
      projectResolution,
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

const createViewProps = ({
  itemType = "container",
  resourceType = "layouts",
} = {}) => ({
  itemType,
  layoutType: "general",
  resourceType,
  layoutsData: EMPTY_TREE,
  charactersData: EMPTY_TREE,
  isInsideSaveLoadSlot: false,
  isInsideDirectedContainer: false,
});

describe("layoutEditPanel size modes", () => {
  it("hides size controls for fragment references", () => {
    for (const resourceType of ["layouts", "controls"]) {
      const state = createInitialState();

      setValues(
        { state },
        {
          values: {
            type: "fragment-ref",
            fragmentLayoutId: "fragment-1",
          },
        },
      );

      const viewData = selectViewData({
        state,
        props: createViewProps({
          itemType: "fragment-ref",
          resourceType,
        }),
        constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      });

      expect(
        viewData.config.sections.some((section) => section.label === "Layout"),
      ).toBe(false);
    }
  });

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

  it("sets text width to fixed from measured text width", () => {
    const deps = createDeps({
      itemType: "text",
      values: {
        type: "text",
        width: undefined,
      },
      selectedElementMetrics: {
        width: 180,
        measuredWidth: 142,
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

    expect(deps.state.values.width).toBe(142);
  });

  it("sets text width to fixed from word wrap fallback when metrics are missing", () => {
    const deps = createDeps({
      itemType: "text",
      values: {
        type: "text",
        textStyle: {
          wordWrapWidth: 240,
        },
      },
      selectedElementMetrics: undefined,
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

    expect(deps.state.values.width).toBe(240);
  });

  it("sets text width to fixed from default fallback when text has no measured width", () => {
    const deps = createDeps({
      itemType: "text",
      projectResolution: {
        width: 200,
        height: 120,
      },
      values: {
        type: "text",
      },
      selectedElementMetrics: {
        width: 0,
        measuredWidth: 0,
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

    expect(deps.state.values.width).toBe(200);
  });
});
