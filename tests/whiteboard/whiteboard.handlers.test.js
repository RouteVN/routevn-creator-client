import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  handleContainerTouchEnd,
  handleContainerTouchMove,
  handleContainerTouchStart,
  handleContainerWheel,
  handleEnsureItemVisible,
  handleWindowMouseMove,
  handleWindowMouseUp,
} from "../../src/components/whiteboard/whiteboard.handlers.js";
import {
  SCENE_BOX_HEIGHT,
  SCENE_BOX_WIDTH,
} from "../../src/internal/whiteboard/constants.js";

const OriginalHTMLElement = globalThis.HTMLElement;
const OriginalCustomEvent = globalThis.CustomEvent;

const createMinimapItemRefs = () => [
  {
    style: {},
    firstElementChild: {
      style: {},
    },
  },
  {
    style: {},
    firstElementChild: {
      style: {},
    },
  },
];

const createDeps = ({
  isDraggingMinimapViewport = true,
  pan = { x: -120, y: -80 },
  zoomLevel = 1.5,
  items = [],
  containerWidth = 100,
  containerHeight = 80,
} = {}) => {
  const minimapItemRefs = createMinimapItemRefs();
  let currentPan = pan;
  let panAnimationFrameId;

  const store = {
    selectContainerSize: vi.fn(() => ({
      width: containerWidth,
      height: containerHeight,
    })),
    selectIsDraggingMinimapViewport: vi.fn(() => isDraggingMinimapViewport),
    selectIsPanMode: vi.fn(() => false),
    selectIsPanning: vi.fn(() => false),
    selectPan: vi.fn(() => currentPan),
    selectZoomLevel: vi.fn(() => zoomLevel),
    selectMinimapData: vi.fn(() => ({
      items: [
        { id: "scene-1", x: 12, y: 10 },
        { id: "scene-2", x: 42, y: 34 },
      ],
      scaledItem: { width: 18, height: 9 },
      viewport: {
        visible: true,
        x: 24,
        y: 16,
        width: 60,
        height: 40,
      },
    })),
    updatePanFromMinimapViewportDragging: vi.fn(),
    stopMinimapViewportDragging: vi.fn(),
    setPan: vi.fn(({ panX, panY }) => {
      currentPan = { x: panX, y: panY };
    }),
    selectPanAnimationFrameId: vi.fn(() => panAnimationFrameId),
    setPanAnimationFrameId: vi.fn(({ frameId }) => {
      panAnimationFrameId = frameId;
    }),
    clearPanAnimationFrameId: vi.fn(() => {
      panAnimationFrameId = undefined;
    }),
    zoomAt: vi.fn(),
  };
  const refs = {
    container: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: containerWidth,
        height: containerHeight,
      }),
      style: {},
    },
    canvas: {
      style: {},
    },
    minimapContainer: {
      getBoundingClientRect: () => ({
        left: 100,
        top: 200,
        width: 200,
        height: 150,
      }),
      querySelectorAll: vi.fn(() => minimapItemRefs),
      style: {},
    },
    minimapViewport: {
      style: {},
    },
  };

  return {
    store,
    refs,
    props: {
      items,
    },
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    minimapItemRefs,
    getPan: () => currentPan,
  };
};

const createTouchDragDeps = ({ selectedItemId = "scene-1" } = {}) => {
  let isDragging = false;
  let dragItemId;
  let dragOffset = { x: 0, y: 0 };
  let lastDraggedPosition;
  let containerSize = { width: 600, height: 420 };
  let touchGesture;
  const itemElement = {
    dataset: { itemId: "scene-1" },
    style: {
      left: "100px",
      top: "60px",
    },
  };
  const store = {
    selectIsPanMode: vi.fn(() => false),
    selectContainerSize: vi.fn(() => containerSize),
    setContainerSize: vi.fn(({ width, height }) => {
      containerSize = { width, height };
    }),
    selectPan: vi.fn(() => ({ x: 0, y: 0 })),
    selectZoomLevel: vi.fn(() => 1),
    setDragOffset: vi.fn((nextDragOffset) => {
      dragOffset = nextDragOffset;
    }),
    startDragging: vi.fn(({ itemId }) => {
      isDragging = true;
      dragItemId = itemId;
    }),
    stopDragging: vi.fn(() => {
      isDragging = false;
      dragItemId = undefined;
    }),
    selectIsDragging: vi.fn(() => isDragging),
    selectDragItemId: vi.fn(() => dragItemId),
    selectDragOffset: vi.fn(() => dragOffset),
    setLastDraggedPosition: vi.fn((position) => {
      lastDraggedPosition = position;
    }),
    selectLastDraggedPosition: vi.fn(() => lastDraggedPosition),
    clearLastDraggedPosition: vi.fn(() => {
      lastDraggedPosition = undefined;
    }),
    startTouchItemPress: vi.fn((gesture) => {
      touchGesture = {
        type: "item-press",
        ...gesture,
        hasMoved: false,
        longPressFired: false,
      };
    }),
    updateTouchItemPress: vi.fn(({ clientX, clientY, moveThreshold }) => {
      if (touchGesture?.type !== "item-press") {
        return;
      }

      const deltaX = clientX - touchGesture.startClientX;
      const deltaY = clientY - touchGesture.startClientY;
      touchGesture.hasMoved =
        touchGesture.hasMoved || Math.hypot(deltaX, deltaY) > moveThreshold;
    }),
    markTouchItemLongPressed: vi.fn(() => {
      if (touchGesture?.type === "item-press") {
        touchGesture.longPressFired = true;
        touchGesture.longPressTimeoutId = undefined;
      }
    }),
    clearTouchLongPressTimeoutId: vi.fn(() => {
      if (touchGesture?.type === "item-press") {
        touchGesture.longPressTimeoutId = undefined;
      }
    }),
    selectTouchGesture: vi.fn(() => touchGesture),
    startTouchPan: vi.fn(),
    updateTouchPan: vi.fn(),
    stopTouchGesture: vi.fn(() => {
      touchGesture = undefined;
    }),
  };
  const refs = {
    container: {
      contains: vi.fn(() => true),
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 600,
        height: 420,
      }),
      style: {},
    },
    canvas: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
      }),
      style: {},
    },
    itemRef0: itemElement,
  };

  return {
    store,
    refs,
    props: { selectedItemId },
    render: vi.fn(),
    dispatchEvent: vi.fn(),
    itemElement,
    target: {
      closest: vi.fn(() => itemElement),
    },
  };
};

const createTouchEvent = ({ target, clientX, clientY, touches } = {}) => ({
  target,
  touches: touches ?? [
    {
      clientX,
      clientY,
    },
  ],
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  cancelable: true,
});

describe("whiteboard minimap drag handlers", () => {
  beforeAll(() => {
    if (typeof globalThis.HTMLElement === "undefined") {
      globalThis.HTMLElement = class {};
    }

    if (typeof globalThis.CustomEvent === "undefined") {
      globalThis.CustomEvent = class CustomEvent extends Event {
        constructor(type, init = {}) {
          super(type, init);
          this.detail = init.detail;
        }
      };
    }
  });

  afterAll(() => {
    if (OriginalHTMLElement === undefined) {
      delete globalThis.HTMLElement;
    } else {
      globalThis.HTMLElement = OriginalHTMLElement;
    }

    if (OriginalCustomEvent === undefined) {
      delete globalThis.CustomEvent;
    } else {
      globalThis.CustomEvent = OriginalCustomEvent;
    }
  });

  it("does not dispatch pan persistence while minimap drag is moving", () => {
    const deps = createDeps();

    handleWindowMouseMove(deps, {
      _event: {
        clientX: 150,
        clientY: 230,
      },
    });

    expect(
      deps.store.updatePanFromMinimapViewportDragging,
    ).toHaveBeenCalledWith({
      mouseX: 50,
      mouseY: 30,
    });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.refs.container.style.backgroundPosition).toBe("-120px -80px");
    expect(deps.refs.canvas.style.transform).toBe(
      "translate(-120px, -80px) scale(1.5)",
    );
    expect(deps.minimapItemRefs[0].style.left).toBe("12px");
    expect(deps.minimapItemRefs[0].style.top).toBe("10px");
    expect(deps.minimapItemRefs[0].firstElementChild.style.width).toBe("18px");
    expect(deps.minimapItemRefs[0].firstElementChild.style.height).toBe("9px");
  });

  it("dispatches one pan-changed event when minimap drag ends", () => {
    const deps = createDeps();

    handleWindowMouseUp(deps);

    expect(deps.store.stopMinimapViewportDragging).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);

    const dispatchedEvent = deps.dispatchEvent.mock.calls[0][0];
    expect(dispatchedEvent.type).toBe("pan-changed");
    expect(dispatchedEvent.detail).toEqual({
      panX: -120,
      panY: -80,
    });
  });

  it("ignores wheel zoom while minimap viewport drag is active", () => {
    const deps = createDeps();
    const event = {
      deltaY: -120,
      preventDefault: vi.fn(),
    };

    handleContainerWheel(deps, {
      _event: event,
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.store.zoomAt).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("drags the selected item after a one-finger touch moves", () => {
    const deps = createTouchDragDeps();
    const touchStartEvent = createTouchEvent({
      target: deps.target,
      clientX: 110,
      clientY: 80,
    });

    handleContainerTouchStart(deps, {
      _event: touchStartEvent,
    });

    expect(touchStartEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(touchStartEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.store.startTouchItemPress).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: "scene-1",
        startClientX: 110,
        startClientY: 80,
      }),
    );
    expect(deps.store.startDragging).not.toHaveBeenCalled();
    expect(deps.store.startTouchPan).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-selected",
        detail: {
          itemId: "scene-1",
        },
      }),
    );

    const touchMoveEvent = createTouchEvent({
      target: deps.target,
      clientX: 160,
      clientY: 120,
    });
    handleContainerTouchMove(deps, {
      _event: touchMoveEvent,
    });

    expect(deps.store.startDragging).toHaveBeenCalledWith({
      itemId: "scene-1",
    });
    expect(deps.store.updateTouchPan).not.toHaveBeenCalled();
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-position-updating",
        detail: {
          itemId: "scene-1",
          x: 150,
          y: 100,
        },
      }),
    );

    const touchEndEvent = createTouchEvent({
      target: deps.target,
      touches: [],
    });
    handleContainerTouchEnd(deps, {
      _event: touchEndEvent,
    });

    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "item-position-changed",
        detail: {
          itemId: "scene-1",
          x: 150,
          y: 100,
        },
      }),
    );
    expect(deps.store.stopDragging).toHaveBeenCalledTimes(1);
  });

  it("opens the item context menu after a stationary long press", () => {
    vi.useFakeTimers();
    try {
      const deps = createTouchDragDeps();
      const touchStartEvent = createTouchEvent({
        target: deps.target,
        clientX: 110,
        clientY: 80,
      });

      handleContainerTouchStart(deps, {
        _event: touchStartEvent,
      });

      vi.advanceTimersByTime(500);

      expect(deps.store.startDragging).not.toHaveBeenCalled();
      expect(deps.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "item-context-menu",
          detail: {
            itemId: "scene-1",
            x: 110,
            y: 80,
          },
        }),
      );

      const touchEndEvent = createTouchEvent({
        target: deps.target,
        touches: [],
      });
      handleContainerTouchEnd(deps, {
        _event: touchEndEvent,
      });

      expect(deps.store.stopTouchGesture).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one-finger pan when touch starts on the background", () => {
    const deps = createTouchDragDeps({ selectedItemId: "scene-2" });
    const backgroundTarget = {
      closest: vi.fn(() => undefined),
    };
    const touchStartEvent = createTouchEvent({
      target: backgroundTarget,
      clientX: 110,
      clientY: 80,
    });

    handleContainerTouchStart(deps, {
      _event: touchStartEvent,
    });

    expect(deps.store.startDragging).not.toHaveBeenCalled();
    expect(deps.store.startTouchPan).toHaveBeenCalledWith({
      touchX: 110,
      touchY: 80,
    });
  });

  it("animates ensureItemVisible when smooth behavior is requested", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const animationFrames = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    try {
      const targetItem = {
        id: "scene-2",
        x: 300,
        y: 120,
      };
      const deps = createDeps({
        isDraggingMinimapViewport: false,
        pan: { x: 0, y: 0 },
        zoomLevel: 1,
        items: [targetItem],
      });
      const targetPan = {
        x: 100 / 2 - (targetItem.x + SCENE_BOX_WIDTH / 2),
        y: 80 / 2 - (targetItem.y + SCENE_BOX_HEIGHT / 2),
      };

      handleEnsureItemVisible(deps, {
        _event: {
          detail: {
            itemId: "scene-2",
            behavior: "smooth",
            durationMs: 100,
          },
        },
      });

      expect(deps.store.setPan).not.toHaveBeenCalled();
      expect(deps.dispatchEvent).not.toHaveBeenCalled();

      animationFrames.shift()(0);
      expect(deps.getPan()).toEqual({ x: 0, y: 0 });

      animationFrames.shift()(50);
      expect(deps.getPan().x).toBeGreaterThan(targetPan.x);
      expect(deps.getPan().x).toBeLessThan(0);
      expect(deps.dispatchEvent).not.toHaveBeenCalled();

      animationFrames.shift()(100);
      expect(deps.getPan()).toEqual(targetPan);
      expect(deps.dispatchEvent).toHaveBeenCalledTimes(1);
      expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("pan-changed");
      expect(deps.dispatchEvent.mock.calls[0][0].detail).toEqual({
        panX: targetPan.x,
        panY: targetPan.y,
      });
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it("cancels stale smooth pan when the next ensure-visible target is already visible", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const animationFrames = [];
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    globalThis.cancelAnimationFrame = vi.fn();

    try {
      const deps = createDeps({
        isDraggingMinimapViewport: false,
        pan: { x: 0, y: 0 },
        zoomLevel: 1,
        containerWidth: 500,
        containerHeight: 400,
        items: [
          {
            id: "scene-1",
            x: 900,
            y: 400,
          },
          {
            id: "scene-2",
            x: 50,
            y: 60,
          },
        ],
      });

      handleEnsureItemVisible(deps, {
        _event: {
          detail: {
            itemId: "scene-1",
            behavior: "smooth",
            durationMs: 100,
          },
        },
      });
      expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

      handleEnsureItemVisible(deps, {
        _event: {
          detail: {
            itemId: "scene-2",
            behavior: "smooth",
            durationMs: 100,
          },
        },
      });

      expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(1);
      expect(deps.store.clearPanAnimationFrameId).toHaveBeenCalled();
      expect(deps.store.setPan).not.toHaveBeenCalled();
      expect(deps.dispatchEvent).not.toHaveBeenCalled();
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });
});
