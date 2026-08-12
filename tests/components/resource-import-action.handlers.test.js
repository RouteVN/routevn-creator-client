import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleMenuButtonClick,
  handleMenuItemClick,
  handleResourceImportComplete,
} from "../../src/components/resourceImportAction/resourceImportAction.handlers.js";

const createDeps = () => ({
  appService: { showToast: vi.fn() },
  dispatchEvent: vi.fn(),
  i18n: { resourceImport: {} },
  render: vi.fn(),
  store: {
    closeImportDialog: vi.fn(),
    closeMenu: vi.fn(),
    openImportDialog: vi.fn(),
    openMenu: vi.fn(),
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

  it("opens the import dialog from the Import menu item", () => {
    const deps = createDeps();
    handleMenuItemClick(deps, {
      _event: { detail: { item: { value: "import" } } },
    });

    expect(deps.store.closeMenu).toHaveBeenCalledOnce();
    expect(deps.store.openImportDialog).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
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
});
