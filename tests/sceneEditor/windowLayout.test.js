import { describe, expect, it } from "vitest";
import {
  createInitialState,
  setUiConfig,
  setAppWindowMetrics,
  setMobileKeyboardState,
  selectViewData,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("scene editor window layout", () => {
  it.each([
    [390, 844, false],
    [744, 1133, false],
    [768, 1024, false],
    [600, 768, false],
    [767, 600, false],
    [768, 600, true],
    [844, 390, true],
    [1133, 744, true],
    [1024, 1024, false],
  ])(
    "uses the full %i × %i app window with and without a keyboard",
    (width, height, expected) => {
      const state = createInitialState();
      setUiConfig({ state }, { uiConfig: { id: "touch" } });
      setAppWindowMetrics({ state }, { width, height });
      const initialView = selectViewData({ state, i18n: EN_I18N });
      expect(initialView.mobileSideBySide).toBe(expected);
      setMobileKeyboardState(
        { state },
        {
          isVisible: true,
          layoutHeight: height,
          visualHeight: height / 2,
          keyboardInset: height / 2,
          bottom: height / 2,
        },
      );
      const keyboardView = selectViewData({ state, i18n: EN_I18N });
      expect(keyboardView.mobileSideBySide).toBe(expected);
      if (expected) {
        expect(keyboardView.mobilePreviewCanvasMaxWidth).toBe(
          initialView.mobilePreviewCanvasMaxWidth,
        );
      }
    },
  );

  it("keeps desktop and shells without window metrics on their existing layouts", () => {
    const state = createInitialState();
    setAppWindowMetrics({ state }, { width: 1440, height: 900 });
    expect(selectViewData({ state, i18n: EN_I18N }).mobileSideBySide).toBe(
      false,
    );
    const touch = createInitialState();
    setUiConfig({ state: touch }, { uiConfig: { id: "touch" } });
    expect(
      selectViewData({ state: touch, i18n: EN_I18N }).mobileSideBySide,
    ).toBe(false);
  });

  it.each([
    ["overlay", 744, 344, 0, "400px"],
    ["panned", 744, 344, 100, "300px"],
    ["resized", 344, 344, 0, "0px"],
  ])(
    "keeps landscape editor and actions above the %s keyboard",
    (_kind, layoutHeight, visualHeight, visualOffsetTop, bottom) => {
      const state = createInitialState();
      setUiConfig({ state }, { uiConfig: { id: "touch" } });
      setAppWindowMetrics({ state }, { width: 1133, height: 744 });
      setMobileKeyboardState(
        { state },
        { isVisible: true, layoutHeight, visualHeight, visualOffsetTop },
      );
      const view = selectViewData({ state, i18n: EN_I18N });
      expect(view.mobileSceneEditorBottomInset).toBe(bottom);
      expect(view.mobileSystemActionsDialogBottom).toBe(
        `calc(${bottom} + 48px)`,
      );
      expect(view.mobileSystemActionsDialogRight).toBe("40%");
      expect(view.mobileEditorBottomSpacerHeight).toBe("48px");
      expect(view.mobileSystemActionsDialogTop).toBe(
        `calc(${visualOffsetTop}px + var(--rvn-mobile-overlay-top-inset, 0px))`,
      );
    },
  );
});
