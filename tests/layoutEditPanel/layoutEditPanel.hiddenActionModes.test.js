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

const viewDataOf = (state) =>
  selectViewData({
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

const actionItemsOf = (viewData) =>
  viewData.config.sections
    .find((section) => section.id === "actions")
    .items.flatMap((item) => item.items);

describe("layoutEditPanel hidden action modes", () => {
  it("hides Conditional and Random from the element's actions editor", () => {
    const state = createInitialState();
    setValues({ state }, { values: { type: "sprite", name: "Element One" } });

    const { hiddenSystemActionModes } = viewDataOf(state);

    expect(hiddenSystemActionModes).toEqual(
      expect.arrayContaining(["conditional", "random"]),
    );
  });

  it("lists a click's actions without its Conditional and Random", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "sprite",
          name: "Element One",
          click: {
            payload: {
              actions: {
                nextLine: {},
                random: {
                  distribution: {
                    type: "weighted",
                    outcomes: [{ weight: 1, actions: { nextLine: {} } }],
                  },
                },
                conditional: {
                  branches: [{ actions: { nextLine: {} } }],
                },
              },
            },
          },
        },
      },
    );

    expect(
      actionItemsOf(viewDataOf(state)).map(({ id, interactionType }) => ({
        id,
        interactionType,
      })),
    ).toEqual([{ id: "nextLine", interactionType: "click" }]);
  });
});
