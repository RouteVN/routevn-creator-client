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

const getAnchorItem = (itemType) => {
  const state = createInitialState();
  setValues(
    { state },
    {
      values: {
        type: itemType,
        name: "Element",
        anchorX: 0.5,
        anchorY: 1,
      },
    },
  );

  const viewData = selectViewData({
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
    i18n: EN_I18N,
  });

  return viewData.config.sections
    .flatMap((section) => section.items)
    .find((item) => item.name === "anchor");
};

describe("layoutEditPanel anchor grid", () => {
  it("uses the nine-cell grid for text anchors", () => {
    expect(getAnchorItem("text-revealing-ref-dialogue-content")).toMatchObject({
      type: "anchor-grid",
      label: "Anchor",
      value: {
        x: 0.5,
        y: 1,
      },
      options: expect.arrayContaining([
        {
          label: "Bottom Center",
          value: {
            x: 0.5,
            y: 1,
          },
        },
      ]),
    });
  });

  it.each([
    "container",
    "fragment-ref",
    "sprite",
    "particle",
    "spritesheet-animation",
    "input",
  ])("uses the nine-cell grid for %s anchors", (itemType) => {
    expect(getAnchorItem(itemType)).toMatchObject({
      type: "anchor-grid",
      name: "anchor",
    });
  });
});
