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

const getReadingDirectionItem = (values) => {
  const state = createInitialState();
  setValues(
    { state },
    { values: { type: "container", name: "Container", ...values } },
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

  return viewData.config.sections
    .flatMap((section) => section.items ?? [])
    .find((item) => item.name === "readingDirection");
};

describe("layoutEditPanel reading direction", () => {
  it.each(["horizontal", "vertical"])(
    "offers left to right and right to left for a %s container",
    (direction) => {
      expect(getReadingDirectionItem({ direction })).toMatchObject({
        type: "segmented-control",
        label: JA_I18N.layoutEditPanel.readingDirectionLabel,
        value: "ltr",
        options: [
          { label: JA_I18N.layoutEditPanel.leftToRightOption, value: "ltr" },
          { label: JA_I18N.layoutEditPanel.rightToLeftOption, value: "rtl" },
        ],
      });
    },
  );

  it("shows a saved right to left choice", () => {
    expect(
      getReadingDirectionItem({
        direction: "horizontal",
        readingDirection: "rtl",
      }).value,
    ).toBe("rtl");
  });

  it("is not offered for an absolute container", () => {
    expect(getReadingDirectionItem({ direction: "absolute" })).toBeUndefined();
    expect(getReadingDirectionItem({})).toBeUndefined();
  });
});
