import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as handlers from "../../src/components/whiteboard/whiteboard.handlers.js";
import * as storeModule from "../../src/components/whiteboard/whiteboard.store.js";

const createDeps = () => {
  const state = storeModule.createInitialState();
  const context = { state, props: { items: [] } };
  const store = Object.fromEntries(
    Object.entries(storeModule).map(([name, method]) => [
      name,
      (...args) => method(context, ...args),
    ]),
  );
  const container = {
    getBoundingClientRect: () => ({
      left: 20,
      top: 40,
      width: 390,
      height: 700,
    }),
    style: {},
  };
  store.setContainerSize({ width: 390, height: 700 });
  store.setInitialZoomAndPan({ zoomLevel: 2, panX: -80, panY: -40 });
  return {
    store,
    refs: { container, canvas: { style: {} } },
    props: context.props,
    handlers,
    render: vi.fn(),
    dispatchEvent: vi.fn(),
  };
};

const touchEvent = (touches = [{ clientX: 140, clientY: 200 }]) => ({
  _event: {
    touches,
    target: { closest: () => undefined },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    cancelable: true,
  },
});

const canvasEvents = (deps) =>
  deps.dispatchEvent.mock.calls
    .map(([event]) => event)
    .filter((event) => event.type === "canvas-context-menu");

describe("whiteboard empty-canvas long press", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits the canvas action after 500 ms without a native contextmenu", () => {
    const deps = createDeps();
    handlers.handleContainerTouchStart(deps, touchEvent());
    vi.advanceTimersByTime(499);
    expect(canvasEvents(deps)).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(canvasEvents(deps).map((event) => event.detail)).toEqual([
      { formX: 140, formY: 200, whiteboardX: 100, whiteboardY: 100 },
    ]);

    const release = touchEvent([]);
    handlers.handleContainerTouchEnd(deps, release);
    expect(release._event.preventDefault).toHaveBeenCalledOnce();
    expect(deps.store.selectTouchGesture()).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tolerates finger jitter without moving the canvas or cancelling the hold", () => {
    const deps = createDeps();
    handlers.handleContainerTouchStart(deps, touchEvent());
    handlers.handleContainerTouchMove(
      deps,
      touchEvent([{ clientX: 143, clientY: 204 }]),
    );
    vi.advanceTimersByTime(500);
    expect(canvasEvents(deps)).toHaveLength(1);
    expect(deps.store.selectPan()).toEqual({ x: -80, y: -40 });

    handlers.handleContainerTouchMove(
      deps,
      touchEvent([{ clientX: 180, clientY: 240 }]),
    );
    expect(deps.store.selectPan()).toEqual({ x: -80, y: -40 });
  });

  it("cancels the hold when the finger pans, even if it returns to its start", () => {
    const deps = createDeps();
    handlers.handleContainerTouchStart(deps, touchEvent());
    handlers.handleContainerTouchMove(
      deps,
      touchEvent([{ clientX: 160, clientY: 230 }]),
    );
    expect(deps.store.selectPan()).toEqual({ x: -60, y: -10 });
    handlers.handleContainerTouchMove(deps, touchEvent());
    vi.advanceTimersByTime(600);
    expect(canvasEvents(deps)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["handleContainerTouchEnd", "handleContainerTouchCancel"])(
    "cancels the hold on %s",
    (handler) => {
      const deps = createDeps();
      handlers.handleContainerTouchStart(deps, touchEvent());
      vi.advanceTimersByTime(200);
      handlers[handler](deps, touchEvent([]));
      vi.advanceTimersByTime(600);
      expect(canvasEvents(deps)).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("cancels for pinch and does not rearm when one finger remains", () => {
    const deps = createDeps();
    handlers.handleContainerTouchStart(deps, touchEvent());
    handlers.handleContainerTouchStart(
      deps,
      touchEvent([
        { clientX: 140, clientY: 200 },
        { clientX: 240, clientY: 300 },
      ]),
    );
    expect(deps.store.selectTouchGesture().type).toBe("pinch");
    handlers.handleContainerTouchEnd(deps, touchEvent());
    vi.advanceTimersByTime(600);
    expect(canvasEvents(deps)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("suppresses native touch contextmenus while preserving desktop right-click", () => {
    const deps = createDeps();
    const contextMenu = {
      _event: { clientX: 140, clientY: 200, preventDefault: vi.fn() },
    };
    handlers.handleContainerTouchStart(deps, touchEvent());
    handlers.handleContainerContextMenu(deps, contextMenu);
    expect(canvasEvents(deps)).toHaveLength(0);
    vi.advanceTimersByTime(500);
    handlers.handleContainerContextMenu(deps, contextMenu);
    expect(canvasEvents(deps)).toHaveLength(1);
    handlers.handleContainerTouchEnd(deps, touchEvent([]));
    handlers.handleContainerContextMenu(deps, contextMenu);
    expect(canvasEvents(deps)).toHaveLength(2);
  });

  it("cleans up a pending hold when the component unmounts", () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", new EventTarget());
    try {
      const deps = createDeps();
      const cleanup = handlers.handleBeforeMount(deps);
      handlers.handleContainerTouchStart(deps, touchEvent());
      cleanup();
      vi.advanceTimersByTime(600);
      expect(canvasEvents(deps)).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
