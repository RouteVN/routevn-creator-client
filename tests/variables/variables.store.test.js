import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
} from "../../src/pages/variables/variables.store.js";

describe("variables.store", () => {
  it("keeps variable resource type separate from value type", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        variablesData: {
          items: {
            folder1: {
              id: "folder1",
              type: "folder",
              name: "Progress",
            },
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
              scope: "context",
            },
          },
          tree: [
            {
              id: "folder1",
              children: [{ id: "score" }],
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state });
    const folder = viewData.flatItems.find((item) => item.id === "folder1");
    const variable = viewData.flatItems.find((item) => item.id === "score");

    expect(folder.svg).toBeUndefined();
    expect(variable).toMatchObject({
      type: "variable",
      variableType: "number",
    });
  });
});
