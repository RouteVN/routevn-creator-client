import { describe, expect, it, vi } from "vitest";
import {
  clearResourcePageSelection,
  dispatchResourceViewBackgroundClick,
} from "../../src/internal/ui/resourcePages/resourceViewBackground.js";

describe("resource view background", () => {
  it("emits a background click from resource-view whitespace", () => {
    const dispatchEvent = vi.fn();

    dispatchResourceViewBackgroundClick(
      { dispatchEvent },
      {
        _event: {
          composedPath: () => [
            {
              matches: vi.fn(() => false),
            },
          ],
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "background-click" }),
    );
  });

  it.each([
    "[data-resource-view-item='true']",
    "[data-resource-view-control='true']",
  ])("ignores clicks from %s", (matchingSelector) => {
    const dispatchEvent = vi.fn();

    dispatchResourceViewBackgroundClick(
      { dispatchEvent },
      {
        _event: {
          composedPath: () => [
            {
              matches: vi.fn((selector) => selector === matchingSelector),
            },
          ],
        },
      },
    );

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("clears page state and the configured explorer selection", () => {
    const deps = {
      store: {
        setSelectedFolderId: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileexplorer: {
          clearSelection: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    clearResourcePageSelection(deps, {
      fileExplorerRefName: "fileexplorer",
    });

    expect(deps.store.setSelectedFolderId).toHaveBeenCalledWith({
      folderId: undefined,
    });
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.refs.fileexplorer.clearSelection).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledOnce();
  });
});
