import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setCurrentTheme,
  setUiConfig,
} from "../../src/pages/appearance/appearance.store.js";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";

describe("appearance store", () => {
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
      "soft-dark",
      "dark",
      "light",
    ]);
    expect(viewData.themes.map(({ name }) => name)).toEqual(names);
    expect(viewData.currentTheme).toBe("soft-dark");
    expect(viewData.themes[0].isSelected).toBe(true);
  });

  it("selects an additional theme without changing its id", () => {
    const state = createInitialState();

    setCurrentTheme({ state }, { theme: "soft-dark" });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(state.currentTheme).toBe("soft-dark");
    expect(
      viewData.themes.find(({ id }) => id === "soft-dark")?.isSelected,
    ).toBe(true);
  });
});
