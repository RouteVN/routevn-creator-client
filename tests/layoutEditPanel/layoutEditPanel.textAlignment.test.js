import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
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

describe("layoutEditPanel text alignment", () => {
  it("uses accessible SVG options for left, center, and right alignment", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text",
          name: "Text",
          textStyle: {
            align: "center",
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        itemType: "text",
        layoutType: "general",
        resourceType: "layouts",
        layoutsData: EMPTY_TREE,
        charactersData: EMPTY_TREE,
        isInsideSaveLoadSlot: false,
        isInsideDirectedContainer: false,
      },
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      i18n: EN_I18N,
    });
    const alignmentItem = viewData.config.sections
      .flatMap((section) => section.items)
      .find((item) => item.name === "textStyle.align");

    expect(alignmentItem).toMatchObject({
      type: "segmented-control",
      value: "center",
      options: [
        {
          label: "Left",
          svg: "text-align-left",
          ariaLabel: "Left",
          value: "left",
        },
        {
          label: "Center",
          svg: "text-align-center",
          ariaLabel: "Center",
          value: "center",
        },
        {
          label: "Right",
          svg: "text-align-right",
          ariaLabel: "Right",
          value: "right",
        },
      ],
    });
  });
});
