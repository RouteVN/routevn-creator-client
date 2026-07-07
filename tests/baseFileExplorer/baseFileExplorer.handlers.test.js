import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleItemContextMenu,
  handleItemPointerDown,
  handleItemTouchStart,
  handleNavigateSelection,
  handleWindowMouseUp,
  handleWindowPointerMove,
  handleWindowPointerUp,
  handleWindowTouchCancel,
  handleWindowTouchEnd,
  handleWindowTouchMove,
} from "../../src/components/baseFileExplorer/baseFileExplorer.handlers.js";
import * as baseFileExplorerStore from "../../src/components/baseFileExplorer/baseFileExplorer.store.js";

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

const createBoundStore = ({ state, props }) => {
  const context = { state, props };
  const store = {};

  for (const [name, fn] of Object.entries(baseFileExplorerStore)) {
    if (
      typeof fn !== "function" ||
      name === "createInitialState" ||
      name === "selectViewData"
    ) {
      continue;
    }

    store[name] = (payload) => fn(context, payload);
  }

  return store;
};

const createItemElement = ({ id, top, parentElement, getScrollTop }) => {
  return {
    parentElement,
    getAttribute: (name) => (name === "data-item-id" ? id : undefined),
    getBoundingClientRect: () => {
      const scrollTop = getScrollTop?.() ?? 0;
      const adjustedTop = top - scrollTop;
      return {
        top: adjustedTop,
        bottom: adjustedTop + 32,
        height: 32,
        y: adjustedTop,
      };
    },
    scrollIntoView: vi.fn(),
    setPointerCapture: vi.fn(),
  };
};

const createPointerEvent = ({
  currentTarget,
  target = currentTarget,
  x,
  y,
  pointerId = 1,
} = {}) => {
  return {
    currentTarget,
    target,
    pointerId,
    pointerType: "touch",
    isPrimary: true,
    clientX: x,
    clientY: y,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
};

const createTouchEvent = ({
  currentTarget,
  target = currentTarget,
  x,
  y,
  ended = false,
} = {}) => {
  const touch = { clientX: x, clientY: y };
  return {
    currentTarget,
    target,
    touches: ended ? [] : [touch],
    changedTouches: [touch],
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
};

const createContextMenuEvent = ({ currentTarget, firesTouchEvents } = {}) => {
  return {
    currentTarget,
    clientX: 10,
    clientY: 16,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    sourceCapabilities:
      firesTouchEvents === undefined ? undefined : { firesTouchEvents },
  };
};

const createArrowTarget = () => {
  return {
    closest: (selector) =>
      selector === "[data-file-explorer-arrow]" ? {} : undefined,
  };
};

const createDragDeps = ({ itemCount = 4, rootHeight = 128 } = {}) => {
  const items = createItems(itemCount);
  const props = {
    items,
    allowDrag: true,
    contextMenuItems: [{ label: "Rename", value: "rename-item" }],
  };
  const state = baseFileExplorerStore.createInitialState();
  const store = createBoundStore({ state, props });
  const refs = {};
  refs.root = {
    scrollTop: 0,
    scrollHeight: items.length * 32,
    clientHeight: rootHeight,
    getBoundingClientRect: () => ({
      top: 0,
      bottom: rootHeight,
      height: rootHeight,
    }),
  };
  const getScrollTop = () => refs.root.scrollTop;
  const parentElement = {
    getBoundingClientRect: () => ({
      top: -getScrollTop(),
      bottom: items.length * 32 - getScrollTop(),
      height: items.length * 32,
    }),
  };

  items.forEach((item, index) => {
    refs[`itemRef${index}`] = createItemElement({
      id: item.id,
      top: index * 32,
      parentElement,
      getScrollTop,
    });
  });

  const deps = {
    dispatchEvent: vi.fn(),
    props,
    refs,
    render: vi.fn(),
    store,
    handlers: {},
  };
  deps.handlers.handleWindowMouseUp = (nextDeps, payload) =>
    handleWindowMouseUp(nextDeps, payload);

  return { deps, state };
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
    vi.useRealTimers();
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

  it("starts mobile drag after long press and drops on touch release", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps();
    const startEvent = createTouchEvent({
      currentTarget: deps.refs.itemRef0,
      x: 10,
      y: 16,
    });

    handleItemTouchStart(deps, {
      _event: startEvent,
    });

    expect(startEvent.preventDefault).toHaveBeenCalled();
    expect(deps.store.selectPendingDrag().id).toBe("item-1");
    expect(deps.store.selectIsDragging()).toBe(false);

    vi.advanceTimersByTime(400);

    expect(deps.store.selectIsDragging()).toBe(true);
    expect(deps.store.selectTouchDragActive()).toBe(true);

    const moveEvent = createTouchEvent({
      currentTarget: deps.refs.itemRef0,
      x: 10,
      y: 90,
    });

    handleWindowTouchMove(deps, { _event: moveEvent });

    expect(moveEvent.preventDefault).toHaveBeenCalled();
    expect(deps.store.selectTargetDropPosition()).toBe("below");

    const endEvent = createTouchEvent({
      currentTarget: deps.refs.itemRef0,
      x: 10,
      y: 90,
      ended: true,
    });

    handleWindowTouchEnd(deps, { _event: endEvent });

    expect(endEvent.preventDefault).toHaveBeenCalled();
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("target-changed");
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      position: "below",
      source: { id: "item-1" },
      target: { id: "item-3" },
    });
    expect(deps.store.selectIsDragging()).toBe(false);
    expect(deps.store.selectTouchDragActive()).toBe(false);
    expect(deps.store.selectSelectedItemId()).toBe("item-1");
  });

  it("starts Android pointer drag after long press and drops on release", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps();
    const pointerDownEvent = createPointerEvent({
      currentTarget: deps.refs.itemRef0,
      x: 10,
      y: 16,
    });

    handleItemPointerDown(deps, {
      _event: pointerDownEvent,
    });

    expect(pointerDownEvent.preventDefault).toHaveBeenCalled();
    expect(deps.refs.itemRef0.setPointerCapture).toHaveBeenCalledWith(1);
    expect(deps.store.selectTouchDragPointerId()).toBe(1);
    expect(deps.store.selectPendingDrag().id).toBe("item-1");

    vi.advanceTimersByTime(400);

    expect(deps.store.selectIsDragging()).toBe(true);
    expect(deps.store.selectTouchDragActive()).toBe(true);

    const moveEvent = createPointerEvent({
      currentTarget: deps.refs.itemRef0,
      x: 10,
      y: 90,
    });

    handleWindowPointerMove(deps, { _event: moveEvent });

    expect(moveEvent.preventDefault).toHaveBeenCalled();
    expect(deps.store.selectTargetDropPosition()).toBe("below");

    const upEvent = createPointerEvent({
      currentTarget: deps.refs.itemRef0,
      x: 10,
      y: 90,
    });

    handleWindowPointerUp(deps, { _event: upEvent });

    expect(upEvent.preventDefault).toHaveBeenCalled();
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      position: "below",
      source: { id: "item-1" },
      target: { id: "item-3" },
    });
    expect(deps.store.selectIsDragging()).toBe(false);
    expect(deps.store.selectTouchDragPointerId()).toBeUndefined();
  });

  it("keeps the active mobile drag when Android sends cancel after long press", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps();

    handleItemTouchStart(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
      }),
    });
    vi.advanceTimersByTime(400);

    handleWindowTouchCancel(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
      }),
    });

    expect(deps.store.selectIsDragging()).toBe(true);
    expect(deps.store.selectTouchDragActive()).toBe(true);

    handleWindowTouchMove(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 90,
      }),
    });
    handleWindowTouchEnd(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 90,
        ended: true,
      }),
    });

    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      position: "below",
      source: { id: "item-1" },
      target: { id: "item-3" },
    });
  });

  it("scrolls the explorer when touch moves before long press", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps();

    handleItemTouchStart(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
      }),
    });

    handleWindowTouchMove(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 4,
      }),
    });
    vi.advanceTimersByTime(400);

    expect(deps.store.selectPendingDrag()).toBeNull();
    expect(deps.store.selectIsDragging()).toBe(false);
    expect(deps.store.selectTouchScrollActive()).toBe(true);
    expect(deps.refs.root.scrollTop).toBe(12);
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("keeps pointer scroll active after pre-longpress pointer movement", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps({
      itemCount: 12,
      rootHeight: 96,
    });

    handleItemPointerDown(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.itemRef0,
        pointerId: 7,
        x: 10,
        y: 32,
      }),
    });

    handleWindowPointerMove(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.itemRef0,
        pointerId: 7,
        x: 10,
        y: 20,
      }),
    });

    expect(deps.store.selectTouchScrollActive()).toBe(true);
    expect(deps.store.selectTouchDragPointerId()).toBe(7);
    expect(deps.refs.root.scrollTop).toBe(12);

    handleWindowPointerMove(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.itemRef0,
        pointerId: 7,
        x: 10,
        y: 8,
      }),
    });

    expect(deps.refs.root.scrollTop).toBe(24);

    handleWindowPointerUp(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.itemRef0,
        pointerId: 7,
        x: 10,
        y: 8,
      }),
    });

    expect(deps.store.selectTouchScrollActive()).toBe(false);
    expect(deps.store.selectTouchDragPointerId()).toBeUndefined();
  });

  it("does not claim touch or pointer starts from the folder arrow", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps();
    const arrowTarget = createArrowTarget();
    const pointerDownEvent = createPointerEvent({
      currentTarget: deps.refs.itemRef0,
      target: arrowTarget,
      x: 10,
      y: 16,
    });
    const touchStartEvent = createTouchEvent({
      currentTarget: deps.refs.itemRef0,
      target: arrowTarget,
      x: 10,
      y: 16,
    });

    handleItemPointerDown(deps, {
      _event: pointerDownEvent,
    });
    handleItemTouchStart(deps, {
      _event: touchStartEvent,
    });
    handleWindowTouchEnd(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        target: arrowTarget,
        x: 10,
        y: 16,
        ended: true,
      }),
    });
    vi.advanceTimersByTime(400);

    expect(pointerDownEvent.preventDefault).not.toHaveBeenCalled();
    expect(touchStartEvent.preventDefault).not.toHaveBeenCalled();
    expect(deps.refs.itemRef0.setPointerCapture).not.toHaveBeenCalled();
    expect(deps.store.selectPendingDrag()).toBeNull();
    expect(deps.store.selectIsDragging()).toBe(false);
    expect(deps.store.selectSelectedItemId()).toBeUndefined();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("ignores unrelated window touchend events when no touch drag is pending", () => {
    const { deps } = createDragDeps();
    const endEvent = createTouchEvent({
      x: 10,
      y: 16,
      ended: true,
    });

    handleWindowTouchEnd(deps, {
      _event: endEvent,
    });

    expect(endEvent.preventDefault).not.toHaveBeenCalled();
    expect(endEvent.stopPropagation).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(deps.store.selectSelectedItemId()).toBeUndefined();
  });

  it("cancels the previous long-press timeout when a tap selects before dragging", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps();

    handleItemTouchStart(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
      }),
    });
    vi.advanceTimersByTime(250);
    handleWindowTouchEnd(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
        ended: true,
      }),
    });

    handleItemTouchStart(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef1,
        x: 10,
        y: 48,
      }),
    });
    vi.advanceTimersByTime(111);

    expect(deps.store.selectIsDragging()).toBe(false);
    expect(deps.store.selectPendingDrag().id).toBe("item-2");

    vi.advanceTimersByTime(249);

    expect(deps.store.selectIsDragging()).toBe(true);
    expect(deps.store.selectSelectedItemId()).toBe("item-2");
  });

  it("auto-scrolls while active mobile drag stays near the bottom edge", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps({
      itemCount: 12,
      rootHeight: 96,
    });

    handleItemTouchStart(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
      }),
    });
    vi.advanceTimersByTime(400);

    handleWindowTouchMove(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 94,
      }),
    });

    const firstScrollTop = deps.refs.root.scrollTop;
    vi.advanceTimersByTime(50);

    expect(firstScrollTop).toBeGreaterThan(0);
    expect(deps.refs.root.scrollTop).toBeGreaterThan(firstScrollTop);
    expect(deps.store.selectItemRects()["item-1"].top).toBe(
      -deps.refs.root.scrollTop,
    );

    handleWindowTouchEnd(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 94,
        ended: true,
      }),
    });

    expect(deps.store.selectDragAutoScrollTimerId()).toBeUndefined();
  });

  it("selects the item when claimed mobile touch ends before long press", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps();

    handleItemTouchStart(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
      }),
    });
    handleWindowTouchEnd(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
        ended: true,
      }),
    });
    vi.advanceTimersByTime(400);

    expect(deps.store.selectSelectedItemId()).toBe("item-1");
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      itemId: "item-1",
    });
    expect(deps.store.selectIsDragging()).toBe(false);
  });

  it("suppresses touch context menu while preserving desktop context menu", () => {
    vi.useFakeTimers();
    const { deps } = createDragDeps();

    handleItemTouchStart(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.itemRef0,
        x: 10,
        y: 16,
      }),
    });

    const touchContextMenuEvent = createContextMenuEvent({
      currentTarget: deps.refs.itemRef0,
      firesTouchEvents: true,
    });

    handleItemContextMenu(deps, { _event: touchContextMenuEvent });

    expect(touchContextMenuEvent.preventDefault).toHaveBeenCalled();
    expect(touchContextMenuEvent.stopPropagation).toHaveBeenCalled();
    expect(deps.store.selectDropdownMenuItemId()).toBeNull();

    const { deps: desktopDeps } = createDragDeps();
    const mouseContextMenuEvent = createContextMenuEvent({
      currentTarget: desktopDeps.refs.itemRef0,
    });

    handleItemContextMenu(desktopDeps, { _event: mouseContextMenuEvent });

    expect(desktopDeps.store.selectDropdownMenuItemId()).toBe("item-1");
  });
});
