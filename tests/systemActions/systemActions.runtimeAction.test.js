import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setMode,
  updateActions,
} from "../../src/components/systemActions/systemActions.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("systemActions runtime action editor", () => {
  it.each([
    ["setMenuPage", "options"],
    ["setMenuEntryPoint", "story"],
  ])("selects the existing %s action for the editor", (mode, value) => {
    const state = createInitialState();

    updateActions(
      { state },
      {
        [mode]: { value },
      },
    );
    setMode({ state }, { mode });

    expect(
      selectViewData({
        state,
        props: {},
        i18n: EN_I18N,
      }).runtimeAction,
    ).toEqual({ value });
  });

  it("passes the selected action through a direct template binding", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/systemActions/systemActions.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(":action=${runtimeAction}");
    expect(view).not.toContain(":action=${actions[mode]}");
  });
});
