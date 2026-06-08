import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
  setVariablesData,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";

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

const createProps = (itemType = "text") => ({
  itemType,
  layoutType: "general",
  resourceType: "layouts",
  layoutsData: EMPTY_TREE,
  charactersData: EMPTY_TREE,
  isInsideSaveLoadSlot: false,
  isInsideDirectedContainer: false,
});

describe("layoutEditPanel text content", () => {
  it("provides scalar variable mention targets for the rich text dialog", () => {
    const state = createInitialState();

    setValues(
      { state },
      {
        values: {
          type: "text",
          text: "Hello",
        },
      },
    );
    setVariablesData(
      { state },
      {
        variablesData: {
          items: {
            playerName: {
              type: "variable",
              name: "Player Name",
            },
            score: {
              type: "variable",
              name: "Score",
              variableType: "number",
            },
            isReady: {
              type: "variable",
              name: "Is Ready",
              variableType: "boolean",
            },
          },
          tree: [{ id: "playerName" }, { id: "score" }, { id: "isReady" }],
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps("text"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });

    expect(viewData.textContentMentionTargets).toEqual([
      {
        id: "playerName",
        label: "Player Name",
        variableType: "string",
      },
      {
        id: "score",
        label: "Score",
        variableType: "number",
      },
    ]);
  });
});
