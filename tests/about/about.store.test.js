import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setUiConfig,
} from "../../src/pages/about/about.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("about store", () => {
  it("shows the localized contact section", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      contactTitle: "Contact Us",
      contactDescription:
        "Have feedback, a comment, a bug report, or a feature request? Get in touch with us.",
      contactButton: "Contact Us",
    });
  });

  it("uses the navbar inset for touch-mode body padding", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { id: "touch" } });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.contentPadding).toBe("0");
    expect(viewData.contentBodyPadding).toBe("md");
    expect(viewData.contentBodyMarginTop).toBe("0");
  });
});
