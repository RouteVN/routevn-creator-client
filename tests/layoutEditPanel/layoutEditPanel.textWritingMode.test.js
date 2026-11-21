import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectViewData,
  setTextDirection,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { handleOptionSelected } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import {
  createConditionalOverrideAttributeForm,
  toConditionalOverrideAttributeItems,
} from "../../src/components/layoutEditPanel/support/layoutEditPanelConditionalOverrides.js";
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

const selectPanelItems = ({ itemType = "text", values }) => {
  const state = createInitialState();
  setValues({ state }, { values: { type: itemType, ...values } });

  const viewData = selectViewData({
    i18n: EN_I18N,
    state,
    props: {
      itemType,
      layoutType: "general",
      resourceType: "layouts",
      layoutsData: EMPTY_TREE,
      charactersData: EMPTY_TREE,
      isInsideSaveLoadSlot: false,
      isInsideDirectedContainer: false,
    },
    constants: LAYOUT_EDIT_PANEL_CONSTANTS,
  });

  return viewData.config.sections.flatMap((section) =>
    section.items.flatMap((item) => [item, ...(item.fields ?? [])]),
  );
};

const findItem = (items, name) => items.find((item) => item.name === name);

const selectOption = (deps, name, value) => {
  handleOptionSelected(deps, {
    _event: {
      currentTarget: { dataset: { name } },
      detail: { value },
    },
  });
};

describe("layoutEditPanel text writing mode", () => {
  it("offers the text direction as one choice, horizontal left to right by default", () => {
    const items = selectPanelItems({ values: { text: "Hello" } });

    expect(findItem(items, "textDirection")).toMatchObject({
      type: "select",
      value: "horizontal-ltr",
      options: [
        expect.objectContaining({
          label: "Horizontal, Left to Right",
          value: "horizontal-ltr",
        }),
        expect.objectContaining({
          label: "Horizontal, Right to Left",
          value: "horizontal-rtl",
        }),
        expect.objectContaining({
          label: "Vertical, Right to Left",
          value: "vertical-rl",
        }),
        expect.objectContaining({
          label: "Vertical, Left to Right",
          value: "vertical-lr",
        }),
      ],
    });
    expect(findItem(items, "writingMode")).toBeUndefined();
    expect(findItem(items, "direction")).toBeUndefined();
    expect(findItem(items, "widthMode")).toMatchObject({ value: "auto" });
    expect(findItem(items, "heightMode")).toBeUndefined();
  });

  it.each([
    [{ direction: "rtl" }, "horizontal-rtl"],
    [{ writingMode: "vertical-lr" }, "vertical-lr"],
    // Route Graphics ignores the direction of vertical text.
    [{ writingMode: "vertical-rl", direction: "rtl" }, "vertical-rl"],
  ])("shows %j as %s", (values, choice) => {
    expect(findItem(selectPanelItems({ values }), "textDirection").value).toBe(
      choice,
    );
  });

  it("sizes vertical text by its column length and aligns it along the column", () => {
    const items = selectPanelItems({
      values: {
        writingMode: "vertical-rl",
        height: 400,
        textStyle: { align: "left" },
      },
    });

    expect(findItem(items, "widthMode")).toBeUndefined();
    expect(findItem(items, "width")).toBeUndefined();
    expect(findItem(items, "heightMode")).toMatchObject({
      stacked: true,
      label: "Height",
      value: "fixed",
    });
    expect(findItem(items, "height").value).toBe(400);
    expect(
      findItem(items, "textStyle.align").options.map(({ label }) => label),
    ).toEqual(["Top", "Center", "Bottom"]);
  });

  it("offers the text direction for dialogue content", () => {
    const items = selectPanelItems({
      itemType: "text-revealing-ref-dialogue-content",
      values: { direction: "rtl" },
    });

    expect(findItem(items, "textDirection").value).toBe("horizontal-rtl");
  });

  it("sets the writing mode and direction a choice stands for", () => {
    const state = createInitialState();
    setValues(
      { state },
      { values: { type: "text", direction: "rtl", text: "Hello" } },
    );
    const deps = {
      props: { itemType: "text" },
      store: {
        selectValues: () => state.values,
        setTextDirection: (payload) => setTextDirection({ state }, payload),
      },
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    selectOption(deps, "textDirection", "vertical-rl");
    expect(state.values).toEqual({
      type: "text",
      text: "Hello",
      writingMode: "vertical-rl",
    });
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      name: "textDirection",
      value: "vertical-rl",
    });

    selectOption(deps, "textDirection", "horizontal-ltr");
    expect(state.values).toEqual({ type: "text", text: "Hello" });
  });

  it("changes its own values as saving the choice changes the item", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text",
          width: 500,
          height: 72,
          textStyle: { align: "left" },
        },
      },
    );

    setTextDirection({ state }, { textDirection: "horizontal-rtl" });
    expect(state.values).toEqual({
      type: "text",
      direction: "rtl",
      width: 500,
      height: 72,
      textStyle: { align: "right" },
    });

    setTextDirection({ state }, { textDirection: "vertical-rl" });
    expect(state.values).toEqual({
      type: "text",
      writingMode: "vertical-rl",
      textStyle: { align: "left" },
    });
  });

  it("names conditional override alignment along the columns of vertical text", () => {
    const alignField = (isVerticalText) =>
      createConditionalOverrideAttributeForm({
        attributeOptions: [],
        textStyleOptions: [],
        copy: EN_I18N.layoutEditPanel,
        isVerticalText,
      }).fields.find((field) => field.name === "align");

    expect(alignField(true).options.map(({ label }) => label)).toEqual([
      "Top",
      "Center",
      "Bottom",
    ]);
    expect(alignField(false).options.map(({ label }) => label)).toEqual([
      "Left",
      "Center",
      "Right",
    ]);
    expect(
      toConditionalOverrideAttributeItems(
        { set: { textStyle: { align: "right" } } },
        EMPTY_TREE,
        EMPTY_TREE,
        EN_I18N.layoutEditPanel,
        { isVerticalText: true },
      )[0].value,
    ).toBe("Bottom");
  });

  it("sets a vertical column length from the measured height", () => {
    const state = createInitialState();
    setValues(
      { state },
      { values: { type: "text", writingMode: "vertical-rl" } },
    );
    const deps = {
      props: {
        itemType: "text",
        projectResolution: { width: 1920, height: 1080 },
        selectedElementMetrics: { width: 96, height: 520 },
      },
      store: {
        selectValues: () => state.values,
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
      },
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    selectOption(deps, "heightMode", "fixed");
    expect(state.values.height).toBe(520);

    selectOption(deps, "heightMode", "auto");
    expect(state.values.height).toBeUndefined();
  });
});
