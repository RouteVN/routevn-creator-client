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

describe("layoutEditPanel empty sections", () => {
  it("renders add-only sections without empty item containers", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "sprite",
          name: "Sprite",
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        itemType: "sprite",
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
    const sectionsById = Object.fromEntries(
      viewData.config.sections.map((section) => [section.id, section]),
    );

    for (const sectionId of [
      "images",
      "blur",
      "sounds",
      "visibilityCondition",
      "actions",
      "conditionalOverrides",
    ]) {
      expect(sectionsById[sectionId]).toMatchObject({
        labelAction: "plus",
        items: [],
      });
    }
  });
});
