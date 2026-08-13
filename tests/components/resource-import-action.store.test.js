import { describe, expect, it } from "vitest";
import {
  closeImportDialog,
  closeMenu,
  createInitialState,
  openImportDialog,
  openMenu,
  selectViewData,
} from "../../src/components/resourceImportAction/resourceImportAction.store.js";

describe("resourceImportAction.store", () => {
  it("opens and closes the import actions menu", () => {
    const state = createInitialState();
    openMenu({ state }, { x: 24, y: 48 });

    expect(selectViewData({ state, i18n: {} }).menu).toEqual({
      isOpen: true,
      x: 24,
      y: 48,
      items: [{ label: "Import", type: "item", value: "import" }],
    });

    closeMenu({ state });
    expect(state.menuPosition).toEqual({ x: 0, y: 0 });
    expect(state.isMenuOpen).toBe(false);
  });

  it("opens and closes the package import dialog", () => {
    const state = createInitialState();
    openImportDialog({ state });
    expect(selectViewData({ state, i18n: {} }).isImportDialogOpen).toBe(true);

    closeImportDialog({ state });
    expect(state.isImportDialogOpen).toBe(false);
  });

  it("renders additional actions before Import", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        additionalMenuItems: [
          { label: "Zoom", type: "item", value: "zoom" },
          { label: "Filter", type: "item", value: "filter" },
        ],
      },
      i18n: {},
    });

    expect(viewData.menu.items.map((item) => item.value)).toEqual([
      "zoom",
      "filter",
      "import",
    ]);
  });
});
