import { describe, expect, it } from "vitest";
import { getSceneStartupErrorMessage } from "../../src/pages/sceneEditorLexical/support/startupError.js";
import { EN_I18N } from "../support/i18n.js";

const projectService = {
  getRepositoryState: () => ({
    variables: {
      items: {
        "variable-1": {
          id: "variable-1",
          type: "variable",
          name: "Ratio",
          computed: { expr: { div: [1, 0] } },
        },
      },
    },
  }),
};

describe("getSceneStartupErrorMessage", () => {
  it("names a computed variable that could not be calculated", () => {
    expect(
      getSceneStartupErrorMessage({
        error: new Error(
          'Computed variable "variable-1" expected type number, got number',
        ),
        projectService,
        i18n: EN_I18N,
      }),
    ).toBe(
      "Could not calculate computed variable “Ratio”. Its formula may have divided by zero or produced the wrong type of value. Check the formula and the variables it uses in Variables.",
    );
  });

  it("falls back to the generic message for other errors", () => {
    expect(
      getSceneStartupErrorMessage({
        error: new Error("Something else"),
        projectService,
        i18n: EN_I18N,
      }),
    ).toBe(EN_I18N.sceneEditorPage.failedOpenScene);
  });
});
