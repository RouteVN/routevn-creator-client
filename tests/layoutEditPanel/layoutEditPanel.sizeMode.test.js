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
import { EN_I18N } from "../support/i18n.js";

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
  it.each(["layouts", "controls"])(
    "stacks text Width above its full-width Auto/Fixed selector for %s",
    (resourceType) => {
      const state = createInitialState();
      setValues(
        { state },
        {
          values: {
            type: "text",
            width: undefined,
            height: 40,
          },
        },
      );

      const viewData = selectViewData({
        i18n: EN_I18N,
        state,
        props: createViewProps({ itemType: "text", resourceType }),
        constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      });
      const widthModeItem = viewData.config.sections
        .flatMap((section) => section.items)
        .find((item) => item.name === "widthMode");

      expect(widthModeItem).toMatchObject({
        type: "segmented-control",
        stacked: true,
        label: "Width",
        value: "auto",
      });
    },
  );

  it("puts directed-container Width and Height in equal stacked-label columns", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "container",
          direction: "horizontal",
          width: 0,
          height: 120,
        },
      },
    );

    const viewData = selectViewData({
      i18n: EN_I18N,
      state,
      props: createViewProps({ itemType: "container" }),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const sizeModeGroup = viewData.config.sections
      .flatMap((section) => section.items)
      .find((item) => item.type === "segmented-control-group");

    expect(sizeModeGroup).toMatchObject({
      type: "segmented-control-group",
      fields: [
        expect.objectContaining({
          name: "widthMode",
          label: "Width",
          value: "auto",
        }),
        expect.objectContaining({
          name: "heightMode",
          label: "Height",
          value: "fixed",
        }),
      ],
    });
  });

  it("stacks Ratio above its full-width mode selector", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "sprite",
          width: 320,
          height: 180,
        },
      },
    );

    const viewData = selectViewData({
      i18n: EN_I18N,
      state,
      props: createViewProps({ itemType: "sprite" }),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const ratioItem = viewData.config.sections
      .flatMap((section) => section.items)
      .find((item) => item.name === "aspectRatioMode");
    const view = readFileSync(
      new URL(
        "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(ratioItem).toMatchObject({
      type: "segmented-control",
      stacked: true,
      label: "Ratio",
      value: "free",
    });
    expect(view).toContain("$if item.stacked");
    expect(view).toContain("rtgl-view d=v w=f g=sm");
    expect(view.match(/rtgl-segmented-control[^\n]*s=sm/g)).toHaveLength(3);
  });

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
        i18n: EN_I18N,
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
