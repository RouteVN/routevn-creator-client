// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomViewportElement } from "../../src/primitives/zoomViewport.js";

customElements.define("test-zoom-viewport", ZoomViewportElement);

// jsdom has no PointerEvent.
class TestPointerEvent extends MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerId = init.pointerId;
    this.pointerType = init.pointerType;
    this.isPrimary = init.isPrimary ?? false;
  }
}

// jsdom has no layout: the content is 400 * zoom wide and 300 * zoom tall,
// placed at the viewport origin minus the scroll offset.
const createViewport = ({ gestures = true } = {}) => {
  const viewport = document.createElement("test-zoom-viewport");
  if (gestures) viewport.setAttribute("gestures", "");
  const content = document.createElement("div");
  const canvas = document.createElement("div");
  const panLayer = document.createElement("div");
  panLayer.setAttribute("data-pan-surface", "");
  content.append(canvas, panLayer);
  viewport.append(content);
  viewport.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 400,
    height: 300,
  });
  content.getBoundingClientRect = () => ({
    left: -viewport.scrollLeft,
    top: -viewport.scrollTop,
    width: 400 * viewport.zoom,
    height: 300 * viewport.zoom,
  });
  document.body.append(viewport);
  return { viewport, canvas, panLayer };
};

const touch = (target, type, pointerId, x, y) => {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
    pointerType: "touch",
    isPrimary: pointerId === 1,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
  return event;
};

describe("rvn-zoom-viewport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", TestPointerEvent);
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("zooms around the viewport center when the zoom attribute changes", () => {
    const { viewport } = createViewport();

    viewport.setAttribute("zoom", "2");

    expect(viewport.zoom).toBe(2);
    expect(viewport.style.getPropertyValue("--canvas-zoom")).toBe("2");
    // The center (200, 150) of 400x300 is the center of 800x600.
    expect([viewport.scrollLeft, viewport.scrollTop]).toEqual([200, 150]);
  });

  it("pinches around the fingers, cancels the content's tap, and reports the zoom", () => {
    const { viewport, canvas } = createViewport();
    const canvasEvents = [];
    for (const type of ["pointerdown", "pointermove", "pointerup"]) {
      canvas.addEventListener(type, (event) =>
        canvasEvents.push(`${type}:${event.pointerId}`),
      );
    }
    canvas.addEventListener("pointercancel", (event) =>
      canvasEvents.push(`pointercancel:${event.pointerId}`),
    );
    const reported = [];
    viewport.addEventListener("zoom-change", (event) =>
      reported.push(event.detail.zoom),
    );

    // Fingers 100 px apart around (100, 100), then 200 px apart around
    // (150, 120).
    touch(canvas, "pointerdown", 1, 50, 100);
    touch(canvas, "pointerdown", 2, 150, 100);
    touch(canvas, "pointermove", 1, 50, 120);
    touch(canvas, "pointermove", 2, 250, 120);

    expect(viewport.zoom).toBe(2);
    // The content point under the old midpoint, (100, 100), is under the
    // new one: 200 - scrollLeft = 150, 200 - scrollTop = 120.
    expect([viewport.scrollLeft, viewport.scrollTop]).toEqual([50, 80]);

    touch(canvas, "pointerup", 2, 250, 120);
    touch(canvas, "pointerup", 1, 50, 120);

    // The content saw the first finger go down and get cancelled, and none of
    // the pinch itself.
    expect(canvasEvents).toEqual(["pointerdown:1", "pointercancel:1"]);
    expect(reported).toEqual([2]);
  });

  it("keeps zoom within its range", () => {
    const { viewport, canvas } = createViewport();

    touch(canvas, "pointerdown", 1, 100, 100);
    touch(canvas, "pointerdown", 2, 110, 100);
    touch(canvas, "pointermove", 2, 400, 100);
    expect(viewport.zoom).toBe(10);
    touch(canvas, "pointermove", 2, 101, 100);
    expect(viewport.zoom).toBe(0.5);
  });

  it("swallows the click after a pinch but not the next tap's", () => {
    const { viewport, canvas } = createViewport();
    const clicks = vi.fn();
    viewport.addEventListener("click", clicks);

    touch(canvas, "pointerdown", 1, 50, 100);
    touch(canvas, "pointerdown", 2, 150, 100);
    touch(canvas, "pointerup", 2, 150, 100);
    touch(canvas, "pointerup", 1, 50, 100);
    canvas.click();
    expect(clicks).not.toHaveBeenCalled();

    touch(canvas, "pointerdown", 3, 50, 100);
    touch(canvas, "pointerup", 3, 50, 100);
    canvas.click();
    expect(clicks).toHaveBeenCalledOnce();
  });

  it("leaves one finger on the content to the content", () => {
    const { viewport, canvas } = createViewport();
    const moves = vi.fn();
    canvas.addEventListener("pointermove", moves);

    touch(canvas, "pointerdown", 1, 50, 100);
    touch(canvas, "pointermove", 1, 90, 140);

    expect(moves).toHaveBeenCalledOnce();
    expect([viewport.scrollLeft, viewport.scrollTop]).toEqual([0, 0]);
  });

  it("pans with one finger from a pan surface or the space around the content", () => {
    const { viewport, panLayer } = createViewport();
    viewport.setAttribute("zoom", "2");
    viewport.scrollLeft = 100;
    viewport.scrollTop = 100;

    touch(panLayer, "pointerdown", 1, 200, 200);
    touch(panLayer, "pointermove", 1, 150, 170);
    touch(panLayer, "pointerup", 1, 150, 170);
    expect([viewport.scrollLeft, viewport.scrollTop]).toEqual([150, 130]);

    touch(viewport, "pointerdown", 2, 10, 10);
    touch(viewport, "pointermove", 2, 30, 20);
    expect([viewport.scrollLeft, viewport.scrollTop]).toEqual([130, 120]);
  });

  it("zooms with a trackpad pinch and reports once it settles", () => {
    const { viewport } = createViewport();
    const reported = [];
    viewport.addEventListener("zoom-change", (event) =>
      reported.push(event.detail.zoom),
    );

    const pinch = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -Math.log(1.5) / 0.01,
      clientX: 0,
      clientY: 0,
    });
    viewport.dispatchEvent(pinch);

    expect(pinch.defaultPrevented).toBe(true);
    expect(viewport.zoom).toBe(1.5);
    expect(reported).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(reported).toEqual([1.5]);

    const scroll = new WheelEvent("wheel", { cancelable: true, deltaY: 40 });
    viewport.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
  });

  it("handles nothing without the gestures attribute", () => {
    const { viewport, canvas } = createViewport({ gestures: false });

    expect(viewport.style.touchAction).toBe("");
    touch(canvas, "pointerdown", 1, 50, 100);
    touch(canvas, "pointerdown", 2, 150, 100);
    touch(canvas, "pointermove", 2, 250, 100);
    expect(viewport.zoom).toBe(1);

    viewport.setAttribute("gestures", "");
    expect(viewport.style.touchAction).toBe("none");
  });
});
