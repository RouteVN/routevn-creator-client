import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setKeyboardState,
} from "../../src/components/mobileKeyboardToolbar/mobileKeyboardToolbar.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("mobileKeyboardToolbar.store", () => {
  it("positions the toolbar above the bottom tabs while the keyboard is hidden", () => {
    const state = createInitialState();

    setKeyboardState(
      { state },
      {
        isVisible: false,
        visualHeight: 800,
      },
    );

    expect(selectViewData({ state, i18n: EN_I18N }).toolbarPositionStyle).toBe(
      "bottom: calc(64px + env(safe-area-inset-bottom))",
    );
  });

  it("keeps the toolbar directly above the visible keyboard", () => {
    const state = createInitialState();

    setKeyboardState(
      { state },
      {
        isVisible: true,
        visualOffsetTop: 0,
        visualHeight: 500,
      },
    );

    expect(selectViewData({ state, i18n: EN_I18N }).toolbarPositionStyle).toBe(
      "top: 452px",
    );
  });
});
