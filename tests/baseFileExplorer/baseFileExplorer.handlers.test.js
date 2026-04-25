import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleNavigateSelection } from "../../src/components/baseFileExplorer/baseFileExplorer.handlers.js";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const createItems = (count) => {
  return Array.from({ length: count }, (_, index) => ({
    id: `item-${index + 1}`,
    type: "image",
    name: `Image ${index + 1}`,
    _level: 0,
    parentId: null,
  }));
};

const createDeps = ({ selectedItemId, itemCount = 15 } = {}) => {
  let currentSelectedItemId = selectedItemId;
  const store = {
    expandItemAncestors: vi.fn(),
    selectCollapsedIds: vi.fn(() => []),
    selectSelectedItemId: vi.fn(() => currentSelectedItemId),
    setSelectedItemId: vi.fn(({ itemId }) => {
      currentSelectedItemId = itemId;
    }),
  };

  return {
    dispatchEvent: vi.fn(),
    props: {
      items: createItems(itemCount),
    },
    refs: {},
    render: vi.fn(),
    store,
  };
};

describe("baseFileExplorer handlers", () => {
  beforeEach(() => {
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("jumps selection by distance and clamps to the visible list bounds", () => {
    const deps = createDeps({
      selectedItemId: "item-8",
    });

    const downResult = handleNavigateSelection(deps, {
      _event: {
        detail: {
          direction: "next",
          distance: 10,
          clamp: true,
        },
      },
    });

    expect(downResult.itemId).toBe("item-15");
    expect(deps.store.setSelectedItemId).toHaveBeenLastCalledWith({
      itemId: "item-15",
    });
    expect(deps.dispatchEvent.mock.calls[0][0].detail.itemId).toBe("item-15");

    const upResult = handleNavigateSelection(deps, {
      _event: {
        detail: {
          direction: "previous",
          distance: 20,
          clamp: true,
        },
      },
    });

    expect(upResult.itemId).toBe("item-1");
    expect(deps.store.setSelectedItemId).toHaveBeenLastCalledWith({
      itemId: "item-1",
    });
    expect(deps.dispatchEvent.mock.calls[1][0].detail.itemId).toBe("item-1");
  });

  it("keeps one-step navigation as a no-op past the visible list bounds", () => {
    const deps = createDeps({
      selectedItemId: "item-3",
      itemCount: 3,
    });

    const result = handleNavigateSelection(deps, {
      _event: {
        detail: {
          direction: "next",
        },
      },
    });

    expect(result).toBeUndefined();
    expect(deps.store.setSelectedItemId).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });
});
