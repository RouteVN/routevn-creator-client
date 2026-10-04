import { describe, expect, it } from "vitest";
import {
  clearPressedActionId,
  closeMoreMenu,
  createInitialState,
  openMoreMenu,
  selectViewData,
  setKeyboardState,
  setPressedActionId,
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

  it("uses the accent background only for the currently pressed item", () => {
    const state = createInitialState();

    setPressedActionId({ state }, { actionId: "arrow-left" });

    const pressedItems = selectViewData({ state, i18n: EN_I18N }).toolbarItems;
    expect(
      pressedItems.find((item) => item.id === "arrow-left")?.bgColor,
    ).toBe("ac");
    expect(pressedItems.find((item) => item.id === "actions")?.bgColor).toBe(
      "mu",
    );

    clearPressedActionId({ state });

    expect(
      selectViewData({ state, i18n: EN_I18N }).toolbarItems.every(
        (item) => item.bgColor === "mu",
      ),
    ).toBe(true);
  });

  it("shows undo and keeps sections, settings, and redo in the More menu", () => {
    const state = createInitialState();
    const view = (props) => selectViewData({ state, props, i18n: EN_I18N });

    expect(view({}).toolbarItems.map((item) => item.id)).toEqual([
      "arrow-left",
      "arrow-up",
      "arrow-down",
      "arrow-right",
      "actions",
      "preview",
      "undo",
      "more",
    ]);
    expect(view({}).moreMenuItems).toEqual([
      expect.objectContaining({
        label: "Sections",
        value: "sections-overview",
      }),
      expect.objectContaining({ label: "Settings", value: "scene-settings" }),
      expect.objectContaining({
        label: "Redo",
        value: "redo",
        disabled: false,
      }),
    ]);

    const disabled = view({ undoDisabled: true, redoDisabled: true });
    expect(
      disabled.toolbarItems.find((item) => item.id === "undo"),
    ).toMatchObject({ title: "Undo", disabled: true, opacity: "0.4" });
    expect(disabled.moreMenuItems[2].disabled).toBe(true);
  });

  it("opens the More menu at its button and closes it", () => {
    const state = createInitialState();

    openMoreMenu({ state }, { x: 380, y: 700 });
    expect(selectViewData({ state, i18n: EN_I18N }).moreMenu).toEqual({
      open: true,
      x: 380,
      y: 700,
    });

    closeMoreMenu({ state });
    expect(selectViewData({ state, i18n: EN_I18N }).moreMenu.open).toBe(false);
  });
});
