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
const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const LAYOUT_EDIT_PANEL_CONSTANTS = yaml.load(
  readSource(
    "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
  ),
);
const layoutEditPanelView = readSource(
  "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
);

describe("layoutEditPanel Fragment section", () => {
  it("shows its layout select with no label beside it", () => {
    const state = createInitialState();
    setValues(
      { state },
      { values: { type: "fragment-ref", fragmentLayoutId: "fragment-1" } },
    );

    const viewData = selectViewData({
      i18n: EN_I18N,
      state,
      props: {
        itemType: "fragment-ref",
        layoutType: "general",
        resourceType: "layouts",
        layoutsData: EMPTY_TREE,
        charactersData: EMPTY_TREE,
        isInsideSaveLoadSlot: false,
        isInsideDirectedContainer: false,
      },
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const section = viewData.config.sections.find(
      (candidate) => candidate.label === "Fragment",
    );

    expect(section.items).toHaveLength(1);
    expect(section.items[0]).toMatchObject({
      type: "select",
      name: "fragmentLayoutId",
      value: "fragment-1",
    });
    expect(section.items[0].label).toBeUndefined();
  });

  it("fills the row with a select that has no label", () => {
    const selectBlock = layoutEditPanelView.slice(
      layoutEditPanelView.indexOf("$elif item.type == 'select':"),
      layoutEditPanelView.indexOf("$elif item.type == 'anchor-grid':"),
    );

    expect(selectBlock).toContain(
      "$elif !item.label:\n                          - rtgl-select#selectItem${i}x${j} data-name=${item.name} w=f ",
    );
  });
});
