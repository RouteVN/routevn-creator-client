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
        selectSelectedItemId: vi.fn(() => undefined),
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

  it("clears item and folder selection after an empty explorer click", () => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    const handlers = createCatalogPageHandlers({
      resourceType: "colors",
    });
    const deps = {
      store: {
        setSelectedFolderId: vi.fn(),
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
          itemId: undefined,
          isFolder: false,
        },
      },
    });

    expect(deps.store.setSelectedFolderId).toHaveBeenCalledWith({
      folderId: undefined,
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
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

  it("runs the page edit handler for the selected catalog item", () => {
    const onEditKey = vi.fn();
    const handlers = createCatalogPageHandlers({
      resourceType: "colors",
      onEditKey,
    });
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => "color-1"),
        selectSelectedFolderId: vi.fn(() => undefined),
      },
      refs: {
        fileExplorer: {
          getSelectedItem: vi.fn(() => ({
            itemId: "color-1",
            isFolder: false,
          })),
        },
      },
    };
    const event = {
      key: "e",
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handlers.handleFileExplorerKeyboardScopeKeyDown(deps, { _event: event });

    expect(onEditKey).toHaveBeenCalledWith({
      deps,
      selectedItemId: "color-1",
      selectedExplorerItem: {
        itemId: "color-1",
        isFolder: false,
      },
    });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });
});
