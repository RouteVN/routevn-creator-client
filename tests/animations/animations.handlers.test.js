import { describe, expect, it, vi } from "vitest";
import {
  handleAnimationItemClick,
  handleFileExplorerSelectionChanged,
} from "../../src/pages/animations/animations.handlers.js";

describe("animations.handlers", () => {
  it("selects an animation from the catalog without logging", () => {
    const deps = {
      store: {
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleAnimationItemClick(deps, {
      _event: {
        detail: {
          itemId: "animation-1",
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "animation-1",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "animation-1",
    });
  });

  it("selects an animation from the file explorer without logging", () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });

    const deps = {
      store: {
        setSelectedItemId: vi.fn(),
      },
      render: vi.fn(),
    };

    handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: "animation-1",
          isFolder: false,
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "animation-1",
    });

    vi.unstubAllGlobals();
  });
});
