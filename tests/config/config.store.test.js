import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setCurrentTheme,
  setCurrentLocale,
  setUiConfig,
  setAssetPackageEnabled,
} from "../../src/pages/config/config.store.js";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";

describe("config store", () => {
  it("defaults Asset Package to disabled and exposes localized options", () => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.assetPackageEnabled).toBe(false);
    expect(viewData.assetPackageOptions).toEqual([
      { value: false, label: "Disabled" },
      { value: true, label: "Enabled" },
    ]);
    expect(viewData.assetPackageDescription).toBe(
      "Enable this if you plan to release an asset pack in the RouteVN asset store.",
    );
    setAssetPackageEnabled({ state }, { enabled: true });
    expect(selectViewData({ state, i18n: EN_I18N }).assetPackageEnabled).toBe(
      true,
    );
  });

  it("uses an images-style two-column touch grid", () => {
    const state = createInitialState();

    setUiConfig({ state }, { uiConfig: { id: "touch" } });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.showExplorerPanel).toBe(false);
    expect(viewData.contentPadding).toBe("0");
    expect(viewData.contentBodyPadding).toBe("md");
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

  it("exposes multiple representative colors for theme thumbnails", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.themes[0].previewPrimary).toBe("oklch(0.9 0 0)");
    expect(viewData.themes[0].previewInput).toBe("oklch(1 0 0 / 18%)");
    expect(viewData.themes[1].previewPrimary).toBe("oklch(0.922 0 0)");
    expect(viewData.themes[1].previewInput).toBe("oklch(1 0 0 / 15%)");
    expect(viewData.themes[2].previewPrimary).toBe("oklch(0.32 0.018 250)");
    expect(viewData.themes[2].previewInput).toBe("oklch(0.91 0.008 250)");
  });

  it.each([
    {
      i18n: EN_I18N,
      names: ["Dark", "Black", "Light"],
    },
    {
      i18n: JA_I18N,
      names: ["ダーク", "ブラック", "ライト"],
    },
    {
      i18n: ZH_HANS_I18N,
      names: ["深色", "黑色", "浅色"],
    },
  ])("localizes all theme names", ({ i18n, names }) => {
    const state = createInitialState();
    const viewData = selectViewData({ state, i18n });

    expect(viewData.themes.map(({ id }) => id)).toEqual([
      "dark",
      "black",
      "light",
    ]);
    expect(viewData.themes.map(({ name }) => name)).toEqual(names);
    expect(viewData.currentTheme).toBe("dark");
    expect(viewData.themes[0].isSelected).toBe(true);
  });

  it("selects an additional theme without changing its id", () => {
    const state = createInitialState();

    setCurrentTheme({ state }, { theme: "black" });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(state.currentTheme).toBe("black");
    expect(viewData.themes.find(({ id }) => id === "black")?.isSelected).toBe(
      true,
    );
  });
});

describe("config language store", () => {
  it("builds the app language selector", () => {
    const state = createInitialState();
    setCurrentLocale({ state }, { locale: "ja" });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData).toMatchObject({
      resourceCategory: "settings",
      selectedResourceId: "config",
      title: "Config",
      appearanceTitle: "Appearance",
      languageTitle: "Language",
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
