import { describe, expect, it, vi } from "vitest";
import {
  handleAnimationItemClick,
  handleFileExplorerSelectionChanged,
} from "../../src/pages/animations/animations.handlers.js";

describe("animations.handlers", () => {
  it("logs full animation data when selecting an animation from the catalog", () => {
    const animationItem = {
      id: "animation-1",
      type: "animation",
      name: "Fade In",
      animation: {
        type: "update",
        tween: {
          alpha: {
            keyframes: [
              {
                duration: 300,
                value: 1,
                easing: "linear",
                relative: false,
              },
            ],
          },
        },
      },
    };
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = {
      store: {
        setSelectedItemId: vi.fn(),
        selectAnimationItemById: vi.fn(() => animationItem),
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
    expect(consoleLog).toHaveBeenCalledWith(
      "Selected animation data",
      animationItem,
    );

    consoleLog.mockRestore();
  });

  it("logs full animation data when selecting an animation from the file explorer", () => {
    const animationItem = {
      id: "animation-1",
      type: "animation",
      name: "Slide",
      animation: {
        type: "transition",
      },
    };
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = {
      store: {
        setSelectedItemId: vi.fn(),
        selectAnimationItemById: vi.fn(() => animationItem),
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
    expect(consoleLog).toHaveBeenCalledWith(
      "Selected animation data",
      animationItem,
    );

    consoleLog.mockRestore();
  });
});
