import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setCurrentLocale,
  setUiConfig,
} from "../../src/pages/language/language.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("settings language store", () => {
  it("builds the app language selector", () => {
    const state = createInitialState();
    setCurrentLocale({ state }, { locale: "ja" });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData).toMatchObject({
      resourceCategory: "settings",
      selectedResourceId: "language",
      title: "Language",
      description: "Choose the language used by RouteVN Creator.",
      currentLocale: "ja",
      languageOptions: [
        { value: "en", label: "English" },
        { value: "ja", label: "日本語 (Beta)" },
        { value: "zh-hans", label: "简体中文 (Beta)" },
      ],
    });
  });

  it("uses the compact settings layout in touch mode", () => {
    const state = createInitialState();
    setUiConfig({ state }, { uiConfig: { id: "touch" } });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isTouchMode: true,
      showExplorerPanel: false,
      contentPadding: "0",
      contentBodyPadding: "md",
      contentBodyMarginTop: "0",
    });
  });
});
