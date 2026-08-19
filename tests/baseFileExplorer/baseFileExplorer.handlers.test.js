import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleClearSelection,
  handleContainerClick,
  handleContainerContextMenu,
  handleContainerPointerDown,
  handleContainerTouchStart,
  handleDropdownMenuClickOverlay,
  handleItemContextMenu,
  handleItemMenuClick,
  handleItemPointerDown,
  handleItemTouchStart,
  handleVisibilityToggleClick,
  handleNavigateSelection,
  handleWindowMouseUp,
  handleWindowPointerCancel,
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
  pointerType = "touch",
  isPrimary = true,
  button = 0,
} = {}) => {
  return {
    currentTarget,
    target,
    pointerId,
    pointerType,
    isPrimary,
    button,
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

const createContextMenuEvent = ({
  currentTarget,
  target = currentTarget,
  firesTouchEvents,
} = {}) => {
  return {
    currentTarget,
    target,
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
    emptyContextMenuItems: [{ label: "New Folder", value: "new-item" }],
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
  let suppressNextClick = false;
  const store = {
    expandItemAncestors: vi.fn(),
    selectCollapsedIds: vi.fn(() => []),
    selectSelectedItemId: vi.fn(() => currentSelectedItemId),
    selectSuppressNextClick: vi.fn(() => suppressNextClick),
    setSelectedItemId: vi.fn(({ itemId }) => {
      currentSelectedItemId = itemId;
    }),
    setSuppressNextClick: vi.fn(({ suppress }) => {
      suppressNextClick = suppress;
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
  it("clears selection through the public explorer method handler", () => {
    const deps = {
      store: {
        clearPendingDrag: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      render: vi.fn(),
    };

    handleClearSelection(deps);

    expect(deps.store.clearPendingDrag).toHaveBeenCalledOnce();
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.render).toHaveBeenCalledOnce();
  });

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

  it("clears selection when the explorer's empty area is clicked", () => {
    const deps = createDeps({ selectedItemId: "item-1" });
    const target = {
      closest: vi.fn(() => undefined),
    };

    handleContainerClick(deps, {
      _event: {
        target,
      },
    });

    expect(target.closest).toHaveBeenCalledWith(
      "[data-file-explorer-item='true']",
    );
    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: undefined,
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "selection-cleared",
        detail: {
          id: undefined,
          itemId: undefined,
          item: undefined,
          isFolder: false,
        },
      }),
    );
    expect(deps.dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "item-click" }),
    );
  });

  it("does not clear selection when a file explorer row is clicked", () => {
    const deps = createDeps({ selectedItemId: "item-1" });
    const item = {};

    handleContainerClick(deps, {
      _event: {
        target: {
          closest: vi.fn(() => item),
        },
      },
    });

    expect(deps.store.setSelectedItemId).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("does not clear selection for the suppressed click after a touch drag", () => {
    const deps = createDeps({ selectedItemId: "item-1" });
    const event = {
      target: {
        closest: vi.fn(() => undefined),
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    deps.store.setSuppressNextClick({ suppress: true });

    handleContainerClick(deps, {
      _event: event,
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.store.setSuppressNextClick).toHaveBeenLastCalledWith({
      suppress: false,
    });
    expect(deps.store.setSelectedItemId).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("opens the empty-space menu after a stationary pointer long press", () => {
    vi.useFakeTimers();
    const { deps, state } = createDragDeps();
    const event = createPointerEvent({
      currentTarget: deps.refs.root,
      x: 24,
      y: 112,
      pointerId: 7,
    });

    handleContainerPointerDown(deps, { _event: event });
    vi.advanceTimersByTime(359);

    expect(state.dropdownMenu.isOpen).toBe(false);

    vi.advanceTimersByTime(1);

    expect(state.dropdownMenu).toEqual({
      isOpen: true,
      position: { x: 24, y: 112 },
      itemId: null,
      items: [{ label: "New Folder", value: "new-item" }],
    });
    expect(deps.store.selectSuppressNextClick()).toBe(true);
    expect(deps.render).toHaveBeenCalledTimes(1);

    const contextMenuEvent = createContextMenuEvent({
      currentTarget: deps.refs.root,
      target: { closest: vi.fn(() => undefined) },
      firesTouchEvents: true,
    });
    handleContainerContextMenu(deps, { _event: contextMenuEvent });

    expect(contextMenuEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(contextMenuEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);

    handleWindowPointerUp(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.root,
        x: 24,
        y: 112,
        pointerId: 7,
      }),
    });

    expect(deps.store.selectEmptyLongPressStartPoint()).toBeUndefined();
    expect(deps.store.selectEmptyLongPressPointerId()).toBeUndefined();

    handleDropdownMenuClickOverlay(deps);

    expect(deps.store.selectSuppressNextClick()).toBe(false);
  });

  it("cancels an empty-space long press when touch movement becomes a scroll", () => {
    vi.useFakeTimers();
    const { deps, state } = createDragDeps();
    handleContainerPointerDown(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.root,
        x: 24,
        y: 80,
        pointerId: 7,
      }),
    });
    const moveEvent = createPointerEvent({
      currentTarget: deps.refs.root,
      x: 24,
      y: 89,
      pointerId: 7,
    });

    handleWindowPointerMove(deps, { _event: moveEvent });
    vi.advanceTimersByTime(400);

    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(deps.store.selectEmptyLongPressStartPoint()).toBeUndefined();
    expect(moveEvent.preventDefault).not.toHaveBeenCalled();
    expect(moveEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("preserves the normal context menu for a pen barrel-button press", () => {
    vi.useFakeTimers();
    const { deps, state } = createDragDeps();

    handleContainerPointerDown(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.root,
        x: 24,
        y: 80,
        pointerType: "pen",
        button: 2,
      }),
    });
    vi.advanceTimersByTime(400);

    expect(deps.store.selectEmptyLongPressTimerId()).toBeUndefined();
    expect(deps.store.selectEmptyLongPressStartPoint()).toBeUndefined();

    const contextMenuEvent = createContextMenuEvent({
      currentTarget: deps.refs.root,
      target: { closest: vi.fn(() => undefined) },
    });
    handleContainerContextMenu(deps, { _event: contextMenuEvent });

    expect(state.dropdownMenu.isOpen).toBe(true);
    expect(contextMenuEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(contextMenuEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it("cancels an empty-space long press when another pointer touches", () => {
    vi.useFakeTimers();
    const { deps, state } = createDragDeps();

    handleContainerPointerDown(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.root,
        x: 24,
        y: 80,
        pointerId: 7,
      }),
    });
    handleContainerPointerDown(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.root,
        x: 40,
        y: 80,
        pointerId: 8,
        isPrimary: false,
      }),
    });
    vi.advanceTimersByTime(400);

    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(deps.store.selectEmptyLongPressTimerId()).toBeUndefined();
    expect(deps.store.selectEmptyLongPressStartPoint()).toBeUndefined();
    expect(deps.store.selectEmptyLongPressPointerId()).toBeUndefined();
  });

  it("ignores container long-press handling when the touch starts on an item", () => {
    vi.useFakeTimers();
    const { deps, state } = createDragDeps();
    const itemTarget = {
      closest: (selector) =>
        selector === "[data-file-explorer-item='true']" ? {} : undefined,
    };

    handleContainerPointerDown(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.root,
        target: itemTarget,
        x: 24,
        y: 16,
      }),
    });
    vi.advanceTimersByTime(400);

    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(deps.store.selectEmptyLongPressTimerId()).toBeUndefined();
  });

  it("supports the touch-event fallback for empty-space long press", () => {
    vi.useFakeTimers();
    const { deps, state } = createDragDeps();
    handleContainerTouchStart(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.root,
        x: 30,
        y: 100,
      }),
    });

    vi.advanceTimersByTime(360);

    expect(state.dropdownMenu.isOpen).toBe(true);
    expect(state.dropdownMenu.position).toEqual({ x: 30, y: 100 });

    handleWindowTouchEnd(deps, {
      _event: createTouchEvent({
        currentTarget: deps.refs.root,
        x: 30,
        y: 100,
        ended: true,
      }),
    });

    expect(deps.store.selectEmptyLongPressStartPoint()).toBeUndefined();
  });

  it("cancels the touch-event fallback when another touch starts", () => {
    vi.useFakeTimers();
    const { deps, state } = createDragDeps();
    const firstTouch = createTouchEvent({
      currentTarget: deps.refs.root,
      x: 30,
      y: 100,
    });

    handleContainerTouchStart(deps, { _event: firstTouch });
    handleContainerTouchStart(deps, {
      _event: {
        ...firstTouch,
        touches: [
          { clientX: 30, clientY: 100 },
          { clientX: 50, clientY: 100 },
        ],
      },
    });
    vi.advanceTimersByTime(400);

    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(deps.store.selectEmptyLongPressTimerId()).toBeUndefined();
    expect(deps.store.selectEmptyLongPressStartPoint()).toBeUndefined();
  });

  it("cancels a pointer-backed empty long press when the pointer is cancelled", () => {
    vi.useFakeTimers();
    const { deps, state } = createDragDeps();
    handleContainerPointerDown(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.root,
        x: 24,
        y: 80,
        pointerId: 7,
      }),
    });

    handleWindowPointerCancel(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.root,
        x: 24,
        y: 80,
        pointerId: 7,
      }),
    });
    vi.advanceTimersByTime(400);

    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(deps.store.selectEmptyLongPressStartPoint()).toBeUndefined();
  });

  it("emits visibility changes without selecting or dragging the row", () => {
    const { deps } = createDragDeps({ itemCount: 1 });
    deps.props.items[0].visibilityToggle = true;
    deps.props.items[0].hidden = false;
    const actionTarget = {
      closest: (selector) =>
        selector === "[data-file-explorer-action]" ? actionTarget : undefined,
    };
    const event = {
      currentTarget: {
        getAttribute: (name) =>
          name === "data-item-id" ? "item-1" : undefined,
      },
      target: actionTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handleItemPointerDown(deps, {
      _event: {
        ...createPointerEvent({
          currentTarget: deps.refs.itemRef0,
          target: actionTarget,
          x: 10,
          y: 16,
        }),
      },
    });
    handleVisibilityToggleClick(deps, { _event: event });

    expect(deps.store.selectPendingDrag()).toBeNull();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-visibility-toggle",
        detail: expect.objectContaining({
          itemId: "item-1",
          hidden: true,
        }),
      }),
    );
  });

  it("opens the item context menu from the trailing action button without dragging or navigating", () => {
    const { deps, state } = createDragDeps({ itemCount: 1 });
    deps.props.contextMenuItems = [
      { label: "Rename", value: "rename-item" },
      { label: "Delete", icon: "trash", value: "delete-item" },
    ];
    const actionTarget = {
      closest: (selector) =>
        selector === "[data-file-explorer-action]" ? actionTarget : undefined,
    };
    const currentTarget = {
      getAttribute: (name) => (name === "data-item-id" ? "item-1" : undefined),
      getBoundingClientRect: () => ({ right: 312.4, bottom: 84.6 }),
    };
    const event = {
      currentTarget,
      target: actionTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    handleItemPointerDown(deps, {
      _event: createPointerEvent({
        currentTarget: deps.refs.itemRef0,
        target: actionTarget,
        x: 300,
        y: 72,
      }),
    });
    handleItemMenuClick(deps, { _event: event });

    expect(deps.store.selectPendingDrag()).toBeNull();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(state.dropdownMenu).toEqual({
      isOpen: true,
      position: { x: 312, y: 85 },
      itemId: "item-1",
      items: [
        { label: "Rename", value: "rename-item" },
        { label: "Delete", value: "delete-item" },
      ],
    });
    expect(deps.store.selectSelectedItemId()).toBe("item-1");
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
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

    const { deps: desktopDeps, state: desktopState } = createDragDeps();
    desktopDeps.props.contextMenuItems = [
      { label: "Delete", icon: "trash", value: "delete-item" },
    ];
    const mouseContextMenuEvent = createContextMenuEvent({
      currentTarget: desktopDeps.refs.itemRef0,
    });

    handleItemContextMenu(desktopDeps, { _event: mouseContextMenuEvent });

    expect(desktopDeps.store.selectDropdownMenuItemId()).toBe("item-1");
    expect(desktopDeps.store.selectSelectedItemId()).toBe("item-1");
    expect(desktopState.dropdownMenu.items).toEqual([
      { label: "Delete", icon: "trash", value: "delete-item" },
    ]);
    expect(desktopDeps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-click",
        detail: expect.objectContaining({ itemId: "item-1" }),
      }),
    );
  });
});
