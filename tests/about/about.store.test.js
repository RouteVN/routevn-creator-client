import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setUiConfig,
} from "../../src/pages/about/about.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("about store", () => {
  it("uses the navbar inset for touch-mode body padding", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { id: "touch" } });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.contentPadding).toBe("0");
    expect(viewData.contentBodyPadding).toBe("md");
    expect(viewData.contentBodyMarginTop).toBe("0");
  });
});
