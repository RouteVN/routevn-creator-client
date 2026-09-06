// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraViewportElement } from "../../src/primitives/cameraViewport.js";

customElements.define("test-camera-viewport", CameraViewportElement);

describe("Camera pointer surface", () => {
  let viewport;
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    viewport = document.createElement("test-camera-viewport");
    Object.defineProperties(viewport, {
      clientWidth: { value: 1008 },
      clientHeight: { value: 588 },
    });
    viewport.surface.setPointerCapture = vi.fn();
    viewport.surface.releasePointerCapture = vi.fn();
    viewport.resolution = { width: 1920, height: 1080 };
    viewport.pose = { x: 960, y: 540, scaleX: 1, scaleY: 1 };
    document.body.append(viewport);
  });
  afterEach(() => {
    viewport.remove();
    vi.unstubAllGlobals();
  });

  it("uses the drag-start pose and viewport ratio across parent rerenders", () => {
    expect(viewport.ratio).toBe(0.5);
    viewport.startDrag({ button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    viewport.moveDrag({ pointerId: 1, clientX: 120, clientY: 110 });
    expect(viewport.pose).toMatchObject({ x: 1000, y: 560 });
    viewport.pose = { ...viewport.pose };
    viewport.moveDrag({ pointerId: 1, clientX: 140, clientY: 120 });
    expect(viewport.pose).toMatchObject({ x: 1040, y: 580 });
    viewport.endDrag({ pointerId: 1, clientX: 150, clientY: 130 });
    expect(viewport.pose).toMatchObject({ x: 1060, y: 600 });
    expect(viewport.drag).toBeUndefined();
  });

  it("restores interrupted drags and ignores other pointers", () => {
    const initial = { ...viewport.pose };
    viewport.startDrag({ button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    viewport.moveDrag({ pointerId: 2, clientX: 120, clientY: 110 });
    expect(viewport.pose).toEqual(initial);
    viewport.moveDrag({ pointerId: 1, clientX: 120, clientY: 110 });
    viewport.endDrag({ pointerId: 1 }, true);
    expect(viewport.pose).toEqual(initial);
  });

  it("keeps pointer focus quiet until keyboard interaction or a new focus session", () => {
    viewport.tabIndex = 0;
    const pointer = { button: 0, pointerId: 1, clientX: 100, clientY: 100 };
    viewport.startDrag(pointer);
    expect(document.activeElement).toBe(viewport);
    expect(viewport.hasAttribute("data-pointer-focus")).toBe(true);
    viewport.handleKeyDown({ key: "Shift" });
    expect(viewport.hasAttribute("data-pointer-focus")).toBe(true);
    viewport.endDrag(pointer);
    expect(viewport.hasAttribute("data-pointer-focus")).toBe(true);
    viewport.handleKeyDown({ key: "ArrowRight", preventDefault: vi.fn() });
    expect(viewport.hasAttribute("data-pointer-focus")).toBe(false);
    expect(viewport.pose.x).toBe(961);

    viewport.startDrag(pointer);
    viewport.endDrag(pointer);
    viewport.blur();
    expect(viewport.hasAttribute("data-pointer-focus")).toBe(false);
  });

  it("blocks native dragging of slotted images without blocking camera movement", () => {
    const image = document.createElement("img");
    image.draggable = true;
    viewport.append(image);
    const drag = new Event("dragstart", {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    expect(image.dispatchEvent(drag)).toBe(false);
    expect(drag.defaultPrevented).toBe(true);

    viewport.startDrag({ button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    viewport.endDrag({ pointerId: 1, clientX: 120, clientY: 110 });
    expect(viewport.pose).toMatchObject({ x: 1000, y: 560 });
  });

  it("preserves nonuniform scaling and applies it to the image and border together", () => {
    viewport.imageSize = { width: 800, height: 600 };
    viewport.pose = { ...viewport.pose, scaleX: 2, scaleY: 1 };
    viewport.zoom(1.5);
    expect(viewport.pose).toMatchObject({ scaleX: 3, scaleY: 1.5 });
    expect(viewport.content.style.width).toBe("400px");
    expect(viewport.content.style.height).toBe("300px");
    expect(viewport.content.style.transform).toBe(
      "translate(-50%, -50%) scale(3, 1.5)",
    );
    viewport.zoom(1000);
    expect(viewport.pose).toMatchObject({ scaleX: 10, scaleY: 5 });
    viewport.zoom(0.00001);
    expect(viewport.pose).toMatchObject({ scaleX: 0.2, scaleY: 0.1 });
  });

  it("supports keyboard movement, zoom and reset", () => {
    const event = { key: "ArrowLeft", shiftKey: true, preventDefault: vi.fn() };
    viewport.handleKeyDown(event);
    expect(viewport.pose.x).toBe(950);
    viewport.handleKeyDown({ ...event, key: "=", shiftKey: false });
    expect(viewport.pose.scaleX).toBeCloseTo(1.01);
    viewport.handleKeyDown({ ...event, key: "+" });
    expect(viewport.pose.scaleX).toBeCloseTo(1.06);
    viewport.handleKeyDown({ ...event, key: "_" });
    expect(viewport.pose.scaleX).toBeCloseTo(1.01);
    viewport.handleKeyDown({ ...event, key: "-", shiftKey: false });
    expect(viewport.pose.scaleX).toBeCloseTo(1);
    viewport.reset();
    expect(viewport.pose).toEqual({ x: 960, y: 540, scaleX: 1, scaleY: 1 });
  });

  it("uses 1-point and 5-point steps at every zoom while preserving aspect ratio and limits", () => {
    viewport.pose = { x: 960, y: 540, scaleX: 2, scaleY: 1 };
    viewport.zoomBy(1);
    expect(viewport.pose.scaleX).toBeCloseTo(2.01);
    viewport.zoomBy(1, true);
    expect(viewport.pose.scaleX).toBeCloseTo(2.06);
    expect(viewport.pose.scaleY).toBeCloseTo(1.03);
    expect(viewport.pose).toMatchObject({ x: 960, y: 540 });
    viewport.zoomBy(1000, true);
    expect(viewport.pose).toMatchObject({ scaleX: 10, scaleY: 5 });
    viewport.zoomBy(-1000, true);
    expect(viewport.pose).toMatchObject({ scaleX: 0.2, scaleY: 0.1 });
  });

  it.each([
    [0, 100],
    [1, 3],
    [2, 1],
  ])(
    "normalizes wheel delta mode %s and accelerates it exactly fivefold with Shift",
    (deltaMode, delta) => {
      const wheel = (options) => {
        const event = new WheelEvent("wheel", {
          deltaMode,
          cancelable: true,
          ...options,
        });
        viewport.surface.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      };
      wheel({ deltaY: -delta });
      expect(viewport.pose.scaleX).toBeCloseTo(1.01);
      wheel({ deltaY: -delta, shiftKey: true });
      expect(viewport.pose.scaleX).toBeCloseTo(1.06);
      wheel({ deltaY: delta });
      expect(viewport.pose.scaleX).toBeCloseTo(1.05);
      // Some browsers map Shift + vertical wheel to horizontal deltas.
      wheel({ deltaX: delta, shiftKey: true });
      expect(viewport.pose.scaleX).toBeCloseTo(1);
    },
  );

  it("keeps fractional wheel motion smooth and ignores zoom during a drag", () => {
    viewport.surface.dispatchEvent(new WheelEvent("wheel", { deltaY: -10 }));
    expect(viewport.pose.scaleX).toBeCloseTo(1.001);
    viewport.startDrag({ button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    viewport.zoomBy(1, true);
    viewport.surface.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
    expect(viewport.pose.scaleX).toBeCloseTo(1.001);
  });
});
