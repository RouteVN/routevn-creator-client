// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no PointerEvent or ResizeObserver.
class TestPointerEvent extends MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerId = init.pointerId;
    this.pointerType = init.pointerType;
    this.isPrimary = init.isPrimary ?? false;
  }
}
const resizeCallbacks = [];
class TestResizeObserver {
  constructor(callback) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  disconnect() {}
}
vi.stubGlobal("PointerEvent", TestPointerEvent);
vi.stubGlobal("ResizeObserver", TestResizeObserver);
const { ZoomViewportElement } = await import(
  "../../src/primitives/zoomViewport.js"
);
customElements.define("test-zoom-viewport", ZoomViewportElement);

// jsdom has no layout: the workspace is 400x300 at the origin, and the
// content is 400x300 times the zoom, placed at the viewport's x and y.
const createViewport = ({ gestures = true } = {}) => {
  const viewport = document.createElement("test-zoom-viewport");
  if (gestures) viewport.setAttribute("gestures", "");
  const content = document.createElement("div");
  const canvas = document.createElement("div");
  content.append(canvas);
  viewport.append(content);
  Object.defineProperties(viewport, {
    clientWidth: { value: 400 },
    clientHeight: { value: 300 },
  });
  Object.defineProperties(content, {
    offsetWidth: { get: () => 400 * viewport.zoom },
    offsetHeight: { get: () => 300 * viewport.zoom },
  });
  viewport.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 400,
    height: 300,
  });
  content.getBoundingClientRect = () => ({
    left: viewport.x,
    top: viewport.y,
    width: 400 * viewport.zoom,
    height: 300 * viewport.zoom,
  });
  document.body.append(viewport);
  const resize = resizeCallbacks.at(-1);
  return { viewport, content, canvas, resize };
};

const pointer = (target, type, pointerId, x, y, init = {}) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
    pointerType: "touch",
    isPrimary: pointerId === 1,
    clientX: x,
    clientY: y,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

const mouse = (target, type, x, y, button = 0) =>
  pointer(target, type, 1, x, y, { pointerType: "mouse", button });

const key = (type, init = {}, target = window) => {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    code: "Space",
    key: " ",
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

const hover = (viewport) =>
  viewport.dispatchEvent(new PointerEvent("pointerenter"));

const wheel = (target, init) => {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe("rvn-zoom-viewport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("keeps its variables out of the inline style the owner sets", () => {
    const { viewport } = createViewport();
    viewport.setAttribute("style", "display: flex;");

    const hostRule = viewport.shadowRoot.querySelector("style").textContent;
    expect(hostRule).toContain("--canvas-zoom: 1;");
    expect(hostRule).toContain("touch-action: none;");
    expect(viewport.shadowRoot.querySelector("slot")).not.toBeNull();
  });

  it("centers the content until a gesture moves it", () => {
    const { viewport, resize } = createViewport();

    resize();
    viewport.setAttribute("zoom", "2");
    expect([viewport.zoom, viewport.x, viewport.y]).toEqual([2, -200, -150]);
    resize();
    expect([viewport.x, viewport.y]).toEqual([-200, -150]);

    pointer(viewport, "pointerdown", 1, 100, 100);
    pointer(viewport, "pointermove", 1, 70, 60);
    pointer(viewport, "pointerup", 1, 70, 60);
    resize();
    expect([viewport.x, viewport.y]).toEqual([-230, -190]);

    viewport.centerContent();
    expect([viewport.x, viewport.y]).toEqual([-200, -150]);
  });

  it("pinches around the fingers, cancels the content's tap, and reports the zoom", () => {
    const { viewport, canvas } = createViewport();
    const canvasEvents = [];
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
    ]) {
      canvas.addEventListener(type, (event) =>
        canvasEvents.push(`${type}:${event.pointerId}`),
      );
    }
    const reported = [];
    viewport.addEventListener("zoom-change", (event) =>
      reported.push(event.detail.zoom),
    );

    // Fingers 100 px apart around (100, 100), then 200 px apart around
    // (150, 120).
    pointer(canvas, "pointerdown", 1, 50, 100);
    pointer(canvas, "pointerdown", 2, 150, 100);
    pointer(canvas, "pointermove", 1, 50, 120);
    pointer(canvas, "pointermove", 2, 250, 120);

    // The content point that was under (100, 100), a quarter across and a
    // third down, is under (150, 120): x + 800 / 4 = 150, y + 600 / 3 = 120.
    expect([viewport.zoom, viewport.x, viewport.y]).toEqual([2, -50, -80]);

    pointer(canvas, "pointerup", 2, 250, 120);
    pointer(canvas, "pointerup", 1, 50, 120);

    expect(canvasEvents).toEqual(["pointerdown:1", "pointercancel:1"]);
    expect(reported).toEqual([2]);
  });

  it("keeps the pinched point under the fingers near a corner and zoomed out", () => {
    const { viewport, canvas } = createViewport();

    pointer(canvas, "pointerdown", 1, 0, 10);
    pointer(canvas, "pointerdown", 2, 20, 10);
    pointer(canvas, "pointermove", 2, 5, 10);

    // 20 px apart around (10, 10), then 5 px apart around (2.5, 10).
    expect(viewport.zoom).toBe(0.25);
    const content = viewport.firstElementChild.getBoundingClientRect();
    expect(content.left + (10 / 400) * content.width).toBeCloseTo(2.5);
    expect(content.top + (10 / 300) * content.height).toBeCloseTo(10);
  });

  it("keeps zoom within its range", () => {
    const { viewport, canvas } = createViewport();

    pointer(canvas, "pointerdown", 1, 100, 100);
    pointer(canvas, "pointerdown", 2, 110, 100);
    pointer(canvas, "pointermove", 2, 500, 100);
    expect(viewport.zoom).toBe(10);
    pointer(canvas, "pointermove", 2, 100.5, 100);
    expect(viewport.zoom).toBe(0.1);
  });

  it("swallows the click after a pinch but not the next tap's", () => {
    const { viewport, canvas } = createViewport();
    const clicks = vi.fn();
    viewport.addEventListener("click", clicks);

    pointer(canvas, "pointerdown", 1, 50, 100);
    pointer(canvas, "pointerdown", 2, 150, 100);
    pointer(canvas, "pointerup", 2, 150, 100);
    pointer(canvas, "pointerup", 1, 50, 100);
    canvas.click();
    expect(clicks).not.toHaveBeenCalled();

    pointer(canvas, "pointerdown", 3, 50, 100);
    pointer(canvas, "pointerup", 3, 50, 100);
    canvas.click();
    expect(clicks).toHaveBeenCalledOnce();
  });

  it("leaves one finger and the left mouse button on the content to it", () => {
    const { viewport, canvas } = createViewport();
    const moves = vi.fn();
    canvas.addEventListener("pointermove", moves);

    pointer(canvas, "pointerdown", 1, 50, 100);
    pointer(canvas, "pointermove", 1, 90, 140);
    pointer(canvas, "pointerup", 1, 90, 140);
    mouse(canvas, "pointerdown", 50, 100);
    mouse(canvas, "pointermove", 90, 140);

    expect(moves).toHaveBeenCalledTimes(2);
    expect([viewport.x, viewport.y]).toEqual([0, 0]);
  });

  it("pans without limits with one finger on the space around the content", () => {
    const { viewport } = createViewport();

    pointer(viewport, "pointerdown", 1, 200, 200);
    pointer(viewport, "pointermove", 1, -300, -200);
    pointer(viewport, "pointerup", 1, -300, -200);
    expect([viewport.x, viewport.y]).toEqual([-500, -400]);

    pointer(viewport, "pointerdown", 2, 10, 10);
    pointer(viewport, "pointermove", 2, 1210, 910);
    expect([viewport.x, viewport.y]).toEqual([700, 500]);
  });

  it("pans with the mouse only while Space is held, with a grab cursor over the content", () => {
    const { viewport } = createViewport();
    const panLayer = viewport.shadowRoot.querySelector("div");
    const clicks = vi.fn();
    viewport.addEventListener("click", clicks);

    // Without Space, a drag on the space around the content moves nothing,
    // and its click still reaches the page, which deselects.
    mouse(viewport, "pointerdown", 100, 100);
    mouse(viewport, "pointermove", 140, 130);
    mouse(viewport, "pointerup", 140, 130);
    viewport.click();
    expect([viewport.x, viewport.y]).toEqual([0, 0]);
    expect(clicks).toHaveBeenCalledOnce();
    expect(panLayer.style.display).toBe("none");

    // Space is not canceled, so macOS keeps showing the cursor, and focus
    // moves to the pan layer, where Space's default action does nothing.
    hover(viewport);
    expect(key("keydown").defaultPrevented).toBe(false);
    expect(key("keydown", { repeat: true }).defaultPrevented).toBe(false);
    expect(viewport.shadowRoot.activeElement).toBe(panLayer);
    expect([panLayer.style.display, panLayer.style.cursor]).toEqual([
      "block",
      "grab",
    ]);

    // The layer covers the content, so a press anywhere lands on it.
    const down = mouse(panLayer, "pointerdown", 100, 100);
    expect(down.defaultPrevented).toBe(true);
    expect(panLayer.style.cursor).toBe("grabbing");
    mouse(panLayer, "pointermove", 140, 130);
    mouse(panLayer, "pointerup", 140, 130);
    viewport.click();
    expect([viewport.x, viewport.y]).toEqual([40, 30]);
    expect(clicks).toHaveBeenCalledOnce();
    expect(panLayer.style.cursor).toBe("grab");

    // A click without moving pans nothing and selects nothing either.
    mouse(panLayer, "pointerdown", 100, 100);
    mouse(panLayer, "pointerup", 100, 100);
    viewport.click();
    expect(clicks).toHaveBeenCalledOnce();

    expect(key("keyup").defaultPrevented).toBe(true);
    expect(panLayer.style.display).toBe("none");
  });

  it("ends a Space drag when Space is released or the window loses focus", () => {
    const { viewport, canvas } = createViewport();
    const panLayer = viewport.shadowRoot.querySelector("div");
    const canvasMoves = vi.fn();
    canvas.addEventListener("pointermove", canvasMoves);

    hover(viewport);
    key("keydown");
    mouse(panLayer, "pointerdown", 100, 100);
    mouse(panLayer, "pointermove", 120, 100);
    key("keyup");
    mouse(canvas, "pointermove", 160, 100);
    expect(viewport.x).toBe(20);
    expect(canvasMoves).toHaveBeenCalledOnce();

    key("keydown");
    mouse(panLayer, "pointerdown", 100, 100);
    window.dispatchEvent(new Event("blur"));
    expect(panLayer.style.display).toBe("none");
    mouse(canvas, "pointermove", 160, 100);
    expect(viewport.x).toBe(20);
  });

  it("types Space into a focused field instead of panning", () => {
    const { viewport } = createViewport();
    const panLayer = viewport.shadowRoot.querySelector("div");
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    hover(viewport);

    expect(key("keydown").defaultPrevented).toBe(false);
    expect(panLayer.style.display).toBe("none");
  });

  it("keeps Space and its repeats from a focused tab or button", () => {
    const { viewport } = createViewport();
    const tab = document.createElement("div");
    tab.tabIndex = 0;
    document.body.append(tab);
    tab.focus();
    const tabKeys = vi.fn();
    tab.addEventListener("keydown", tabKeys);
    tab.addEventListener("keyup", tabKeys);
    hover(viewport);

    key("keydown", {}, tab);
    key("keydown", { repeat: true }, tab);
    key("keyup", {}, tab);

    expect(tabKeys).not.toHaveBeenCalled();
  });

  it("leaves Space to the page while the pointer is outside the workspace", () => {
    const { viewport } = createViewport();
    const panLayer = viewport.shadowRoot.querySelector("div");

    expect(key("keydown").defaultPrevented).toBe(false);
    expect(panLayer.style.display).toBe("none");

    hover(viewport);
    viewport.dispatchEvent(new PointerEvent("pointerleave"));
    key("keydown");
    expect(panLayer.style.display).toBe("none");
  });

  it("pans with the middle mouse button anywhere", () => {
    const { viewport, canvas } = createViewport();

    const canvasDowns = vi.fn();
    canvas.addEventListener("pointerdown", canvasDowns);
    const middle = mouse(canvas, "pointerdown", 100, 100, 1);
    mouse(canvas, "pointermove", 90, 120, 1);
    expect([viewport.x, viewport.y]).toEqual([-10, 20]);
    expect(middle.defaultPrevented).toBe(true);
    expect(canvasDowns).not.toHaveBeenCalled();
    expect(viewport.shadowRoot.querySelector("div").style.cursor).toBe(
      "grabbing",
    );
  });

  it("leaves the wheel over the content to it and never pans with it", () => {
    const { viewport, canvas } = createViewport();

    expect(wheel(canvas, { deltaX: 10, deltaY: 20 }).defaultPrevented).toBe(
      false,
    );
    expect([viewport.zoom, viewport.x, viewport.y]).toEqual([1, 0, 0]);
  });

  it("zooms a step around the pointer with the wheel around the content", () => {
    const { viewport } = createViewport();
    const reported = [];
    viewport.addEventListener("zoom-change", (event) =>
      reported.push(event.detail.zoom),
    );

    // The middle of the content stays under the pointer: 200 - 360 / 2 = 20
    // and 150 - 270 / 2 = 15.
    const down = wheel(viewport, { deltaY: 100, clientX: 200, clientY: 150 });
    expect(down.defaultPrevented).toBe(true);
    expect([viewport.zoom, viewport.x, viewport.y]).toEqual([0.9, 20, 15]);
    // The step is the same however far one notch scrolls.
    wheel(viewport, { deltaY: -3, clientX: 200, clientY: 150 });
    expect(viewport.zoom).toBe(0.99);
    // Sideways scrolling moves nothing.
    wheel(viewport, { deltaX: 40, clientX: 200, clientY: 150 });
    expect(viewport.zoom).toBe(0.99);

    expect(reported).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(reported).toEqual([0.99]);
  });

  it("zooms with a trackpad pinch anywhere", () => {
    const { viewport, canvas } = createViewport();

    const pinch = wheel(canvas, {
      ctrlKey: true,
      deltaY: -Math.log(1.5) / 0.01,
      clientX: 0,
      clientY: 0,
    });
    expect(pinch.defaultPrevented).toBe(true);
    expect([viewport.zoom, viewport.x, viewport.y]).toEqual([1.5, 0, 0]);
  });

  it("handles nothing without the gestures attribute", () => {
    const { viewport, canvas } = createViewport({ gestures: false });

    expect(
      viewport.shadowRoot.querySelector("style").textContent,
    ).not.toContain("touch-action");
    pointer(canvas, "pointerdown", 1, 50, 100);
    pointer(canvas, "pointerdown", 2, 150, 100);
    pointer(canvas, "pointermove", 2, 250, 100);
    expect(wheel(viewport, { deltaY: 40 }).defaultPrevented).toBe(false);
    expect([viewport.zoom, viewport.x, viewport.y]).toEqual([1, 0, 0]);
  });
});
