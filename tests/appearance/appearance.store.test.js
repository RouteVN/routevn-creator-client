import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setUiConfig,
} from "../../src/pages/appearance/appearance.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("appearance store", () => {
  it("uses an images-style two-column touch grid", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { id: "touch" } });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.showExplorerPanel).toBe(false);
    expect(viewData.contentPadding).toBe("0");
    expect(viewData.contentBodyPadding).toBe("lg");
    expect(viewData.contentBodyMarginTop).toBe("0");
    expect(viewData.themeGridColumns).toBe("2");
    expect(viewData.themePreviewAspectRatio).toBe("16 / 9");
  });

  it("keeps desktop cards in fixed-width autofill columns", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.showExplorerPanel).toBe(true);
    expect(viewData.themeGridColumns).toBe(
      "repeat(auto-fill, minmax(min(320px, 100%), 320px))",
    );
    expect(viewData.themePreviewAspectRatio).toBe("16 / 9");
  });
});
