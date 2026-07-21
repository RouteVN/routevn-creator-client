import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import { handleOptionSelected } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import {
  createInitialState,
  selectViewData,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
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

const selectPanelViewData = (values) => {
  const state = createInitialState();
  setValues({ state }, { values });

  return selectViewData({
    state,
    props: {
      itemType: values.type,
      layoutType: "save-load",
      resourceType: "layouts",
      layoutsData: EMPTY_TREE,
      charactersData: EMPTY_TREE,
      isInsideSaveLoadSlot: true,
      isInsideDirectedContainer: false,
    },
    constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    i18n: EN_I18N,
  });
};

describe("layoutEditPanel save/load date format", () => {
  it("shows date-only formats with right-aligned examples", () => {
    const viewData = selectPanelViewData({
      type: "text-ref-save-load-slot-date",
      name: "Save Date",
    });
    const dateSection = viewData.config.sections.find(
      (section) => section.label === "Date",
    );

    expect(dateSection.items).toEqual([
      {
        type: "select",
        label: "Format",
        name: "dateFormat",
        value: "YYYY-MM-DD",
        options: [
          {
            label: "YYYY-MM-DD",
            value: "YYYY-MM-DD",
            suffixText: "2026-12-31",
          },
          {
            label: "DD/MM/YYYY",
            value: "DD/MM/YYYY",
            suffixText: "31/12/2026",
          },
          {
            label: "MM/DD/YYYY",
            value: "MM/DD/YYYY",
            suffixText: "12/31/2026",
          },
          {
            label: "DD MMM YYYY",
            value: "DD MMM YYYY",
            suffixText: "31 Dec 2026",
          },
          {
            label: "YYYY年MM月DD日",
            value: "YYYY年MM月DD日",
            suffixText: "2026年12月31日",
          },
        ],
        viewKey: expect.any(String),
      },
    ]);
  });

  it("does not show date format authoring for ordinary text", () => {
    const viewData = selectPanelViewData({
      type: "text",
      name: "Label",
      text: "Hello",
    });

    expect(
      viewData.config.sections.flatMap((section) => section.items),
    ).not.toContainEqual(expect.objectContaining({ name: "dateFormat" }));
  });

  it("uses the standard select update path", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text-ref-save-load-slot-date",
          dateFormat: "DD/MM/YYYY",
        },
      },
    );
    const deps = {
      store: {
        selectValues: () => state.values,
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
        closePopoverForm: vi.fn(),
      },
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    handleOptionSelected(deps, {
      _event: {
        currentTarget: {
          dataset: { name: "dateFormat" },
        },
        detail: {
          item: { value: "DD MMM YYYY" },
        },
      },
    });

    expect(state.values.dateFormat).toBe("DD MMM YYYY");
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          name: "dateFormat",
          value: "DD MMM YYYY",
        }),
      }),
    );
  });
});
