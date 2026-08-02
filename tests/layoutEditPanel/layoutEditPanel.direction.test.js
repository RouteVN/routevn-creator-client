import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { JA_I18N } from "../support/i18n.js";

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

describe("layoutEditPanel direction", () => {
  it("uses accessible SVG options for container direction", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "container",
          name: "Container",
          direction: "horizontal",
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        itemType: "container",
        layoutType: "general",
        resourceType: "layouts",
        layoutsData: EMPTY_TREE,
        charactersData: EMPTY_TREE,
        isInsideSaveLoadSlot: false,
        isInsideDirectedContainer: false,
      },
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
      i18n: JA_I18N,
    });
    const [transformSection, layoutSection, appearanceSection] =
      viewData.config.sections;
    const directionItem = layoutSection.items.find(
      (item) => item.name === "direction",
    );
    const scrollItem = layoutSection.items.find(
      (item) => item.name === "scroll",
    );
    const gapGroup = layoutSection.items.find((item) => {
      return item.fields?.some((field) => field.name === "gapX");
    });

    expect([
      transformSection.label,
      layoutSection.label,
      appearanceSection.label,
    ]).toEqual([
      JA_I18N.layoutEditPanel.transformSection,
      JA_I18N.layoutEditPanel.layoutSection,
      JA_I18N.layoutEditPanel.appearanceSection,
    ]);

    expect(directionItem).toMatchObject({
      type: "segmented-control",
      stacked: true,
      value: "horizontal",
      options: [
        {
          label: "絶対配置",
          svg: "layout-direction-absolute",
          ariaLabel: "絶対配置",
          tooltip: "絶対配置",
          value: "absolute",
        },
        {
          label: "横",
          svg: "layout-direction-horizontal",
          ariaLabel: "横",
          tooltip: "横",
          value: "horizontal",
        },
        {
          label: "縦",
          svg: "layout-direction-vertical",
          ariaLabel: "縦",
          tooltip: "縦",
          value: "vertical",
        },
      ],
    });
    expect(scrollItem).toMatchObject({
      type: "segmented-control",
      stacked: true,
      label: "スクロール",
    });
    expect(gapGroup).toMatchObject({
      type: "group",
      stacked: true,
      fields: [
        expect.objectContaining({ name: "gapX" }),
        expect.objectContaining({ name: "gapY" }),
      ],
    });
  });
});
