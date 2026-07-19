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

describe("layoutEditPanel reveal effect", () => {
  it("uses a standard select with localized reveal-effect options", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text-revealing",
          name: "Revealing text",
          revealEffect: "softWipe",
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        itemType: "text-revealing",
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
    const revealEffectItem = viewData.config.sections
      .flatMap((section) => section.items)
      .find((item) => item.name === "revealEffect");

    expect(revealEffectItem).toMatchObject({
      type: "select",
      label: "Effect",
      value: "softWipe",
      options: [
        { label: "Typewriter", value: "typewriter" },
        { label: "Soft Wipe", value: "softWipe" },
        { label: "None", value: "none" },
      ],
    });
  });
});
