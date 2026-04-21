import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogPageHandlers } from "../../src/internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

describe("createCatalogPageHandlers", () => {
  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("focuses the keyboard scope after explorer selection changes", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const handlers = createCatalogPageHandlers({
      resourceType: "colors",
    });
    const deps = {
      store: {
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handlers.handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: "color-1",
          isFolder: false,
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "color-1",
    });
    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledTimes(1);
  });

  it("focuses the keyboard scope after mount", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const handlers = createCatalogPageHandlers({
      resourceType: "colors",
    });
    const deps = {
      refs: {
        fileExplorerKeyboardScope: {
          focus: vi.fn(),
        },
      },
    };

    handlers.handleAfterMount(deps);

    expect(deps.refs.fileExplorerKeyboardScope.focus).toHaveBeenCalledTimes(1);
  });
});
