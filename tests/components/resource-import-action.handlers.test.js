import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleMenuButtonClick,
  handleMenuItemClick,
  handleResourceImportComplete,
} from "../../src/components/resourceImportAction/resourceImportAction.handlers.js";
import { RU_I18N } from "../support/i18n.js";

const createDeps = () => ({
  appService: { pickFiles: vi.fn(), showToast: vi.fn() },
  dispatchEvent: vi.fn(),
  i18n: { resourceImport: {} },
  render: vi.fn(),
  store: {
    closeImportDialog: vi.fn(),
    closeMenu: vi.fn(),
    openImportDialog: vi.fn(),
    openMenu: vi.fn(),
    selectMenuPosition: vi.fn(() => ({ x: 101, y: 48 })),
  },
});

describe("resourceImportAction.handlers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("opens the actions menu below the three-dot button", () => {
    const deps = createDeps();
    const stopPropagation = vi.fn();
    handleMenuButtonClick(deps, {
      _event: {
        stopPropagation,
        currentTarget: {
          getBoundingClientRect: () => ({ right: 101.4, bottom: 48.2 }),
        },
      },
    });

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(deps.store.openMenu).toHaveBeenCalledWith({ x: 101, y: 48 });
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it.each([
    ["import-store", "store"],
    ["import-url", "url"],
  ])("opens the import dialog from %s on the %s source", (value, source) => {
    const deps = createDeps();
    handleMenuItemClick(deps, {
      _event: { detail: { item: { value } } },
    });

    expect(deps.store.closeMenu).toHaveBeenCalledOnce();
    expect(deps.store.openImportDialog).toHaveBeenCalledWith({ source });
    expect(deps.appService.pickFiles).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("picks a zip file, then opens the import dialog on it", async () => {
    const deps = createDeps();
    const file = new Blob(["zip"]);
    deps.appService.pickFiles.mockResolvedValue(file);

    await handleMenuItemClick(deps, {
      _event: { detail: { item: { value: "import-zip" } } },
    });

    expect(deps.store.closeMenu).toHaveBeenCalledOnce();
    expect(deps.appService.pickFiles).toHaveBeenCalledWith({
      accept: ".zip,application/zip",
      multiple: false,
    });
    expect(deps.store.openImportDialog).toHaveBeenCalledWith({
      source: "zip",
      file,
    });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("does nothing when the zip file pick is cancelled", async () => {
    const deps = createDeps();
    deps.appService.pickFiles.mockResolvedValue(null);

    await handleMenuItemClick(deps, {
      _event: { detail: { item: { value: "import-zip" } } },
    });

    // The menu closed; nothing else happened.
    expect(deps.store.closeMenu).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.store.openImportDialog).not.toHaveBeenCalled();
    expect(deps.appService.showToast).not.toHaveBeenCalled();
  });

  it("says so when the zip file cannot be picked", async () => {
    const deps = createDeps();
    deps.i18n = RU_I18N;
    deps.appService.pickFiles.mockRejectedValue(new Error("picker failed"));

    await handleMenuItemClick(deps, {
      _event: { detail: { item: { value: "import-zip" } } },
    });

    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Не удалось выбрать файл.",
      status: "error",
    });
    expect(deps.store.openImportDialog).not.toHaveBeenCalled();
  });

  it("emits non-import menu actions with the menu position", () => {
    vi.stubGlobal(
      "CustomEvent",
      class CustomEvent {
        constructor(type, options) {
          this.type = type;
          Object.assign(this, options);
        }
      },
    );
    const deps = createDeps();
    const item = { label: "Zoom", type: "item", value: "zoom" };

    handleMenuItemClick(deps, {
      _event: { detail: { item } },
    });

    expect(deps.store.closeMenu).toHaveBeenCalledOnce();
    expect(deps.store.openImportDialog).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "menu-action",
        detail: { item, position: { x: 101, y: 48 } },
        bubbles: true,
        composed: true,
      }),
    );
  });

  it("reports a completed package import", () => {
    vi.stubGlobal(
      "CustomEvent",
      class CustomEvent {
        constructor(type, options) {
          this.type = type;
          Object.assign(this, options);
        }
      },
    );
    const deps = createDeps();
    handleResourceImportComplete(deps, {
      _event: { detail: { importedCount: 3 } },
    });

    expect(deps.store.closeImportDialog).toHaveBeenCalledOnce();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Imported 3 resources from the asset package.",
      status: "success",
    });
    expect(deps.dispatchEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "search-input",
        detail: { value: "" },
        bubbles: true,
        composed: true,
      }),
    );
    expect(deps.dispatchEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "tag-filter-change",
        detail: { tagIds: [] },
        bubbles: true,
        composed: true,
      }),
    );
    expect(deps.dispatchEvent).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        type: "import-complete",
        detail: { importedCount: 3 },
        bubbles: true,
        composed: true,
      }),
    );
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("picks the plural form of the imported count", () => {
    vi.stubGlobal("CustomEvent", class CustomEvent {});
    const reportImport = (i18n, importedCount) => {
      const deps = createDeps();
      deps.i18n = i18n;
      handleResourceImportComplete(deps, {
        _event: { detail: { importedCount } },
      });
      return deps.appService.showToast.mock.calls[0][0].message;
    };

    expect(reportImport({ resourceImport: {} }, 1)).toBe(
      "Imported 1 resource from the asset package.",
    );
    expect(reportImport(RU_I18N, 1)).toBe("Из пакета импортирован 1 ресурс.");
    expect(reportImport(RU_I18N, 22)).toBe(
      "Из пакета импортировано 22 ресурса.",
    );
    expect(reportImport(RU_I18N, 25)).toBe(
      "Из пакета импортировано 25 ресурсов.",
    );
  });
});
