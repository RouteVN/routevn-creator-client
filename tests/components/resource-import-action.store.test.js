import { describe, expect, it } from "vitest";
import {
  closeImportDialog,
  closeMenu,
  createInitialState,
  openImportDialog,
  openMenu,
  selectViewData,
} from "../../src/components/resourceImportAction/resourceImportAction.store.js";
import { RU_I18N } from "../support/i18n.js";

describe("resourceImportAction.store", () => {
  it("opens and closes the import actions menu", () => {
    const state = createInitialState();
    openMenu({ state }, { x: 24, y: 48 });

    expect(selectViewData({ state, i18n: {} }).menu).toEqual({
      isOpen: true,
      x: 24,
      y: 48,
      items: [
        {
          label: "Import from Asset Store",
          type: "item",
          value: "import-store",
        },
        { label: "Import from Zip File", type: "item", value: "import-zip" },
        { label: "Import from URL", type: "item", value: "import-url" },
      ],
    });
    // With nothing but the Import items, the button is named for them.
    expect(selectViewData({ state, i18n: {} }).menuLabel).toBe("Import");

    closeMenu({ state });
    expect(state.menuPosition).toEqual({ x: 0, y: 0 });
    expect(state.isMenuOpen).toBe(false);
  });

  it("opens and closes the package import dialog", () => {
    const state = createInitialState();
    openImportDialog({ state });
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      isImportDialogOpen: true,
      importSource: "store",
      importFile: undefined,
    });

    closeImportDialog({ state });
    expect(selectViewData({ state, i18n: {} }).isImportDialogOpen).toBe(false);
  });

  it("opens the dialog on a picked zip file or on a URL, and lets the file go when it closes", () => {
    const state = createInitialState();
    const file = new Blob(["zip"]);
    openImportDialog({ state }, { source: "zip", file });
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      isImportDialogOpen: true,
      importSource: "zip",
      importFile: file,
    });

    closeImportDialog({ state });
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      isImportDialogOpen: false,
      importFile: undefined,
    });

    openImportDialog({ state }, { source: "url" });
    expect(selectViewData({ state, i18n: {} })).toMatchObject({
      isImportDialogOpen: true,
      importSource: "url",
      importFile: undefined,
    });
  });

  it("localizes the three Import items", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      i18n: RU_I18N,
    });

    expect(viewData.menu.items.map((item) => item.label)).toEqual([
      "Импорт из магазина ресурсов",
      "Импорт из ZIP-файла",
      "Импорт по ссылке",
    ]);
  });

  it("leaves Import out when the page hides it", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        showImport: false,
        additionalMenuItems: [{ label: "Zoom", type: "item", value: "zoom" }],
      },
      i18n: {},
    });

    expect(viewData.menu.items.map((item) => item.value)).toEqual(["zoom"]);
    expect(viewData.menuLabel).toBe("Actions");
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
      "import-store",
      "import-zip",
      "import-url",
    ]);
    expect(viewData.menuLabel).toBe("Actions");
  });
});
