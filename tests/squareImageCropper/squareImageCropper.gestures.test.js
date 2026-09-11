import { describe, expect, it, vi } from "vitest";
import * as store from "../../src/components/squareImageCropper/squareImageCropper.store.js";
import * as handlers from "../../src/components/squareImageCropper/squareImageCropper.handlers.js";

const createCropper = (imageWidth = 640, imageHeight = 640) => {
  const context = { state: store.createInitialState() };
  const boundStore = Object.fromEntries(
    Object.entries(store).map(([name, method]) => [
      name,
      (payload) => method(context, payload),
    ]),
  );
  boundStore.setImage({ imageUrl: "blob:image", imageWidth, imageHeight });
  return { context, store: boundStore };
};

const expectCropInsideImage = ({ context, store }) => {
  const { sourceX, sourceY, sourceSize } = store.selectCropSelection();
  expect(sourceX).toBeGreaterThanOrEqual(0);
  expect(sourceY).toBeGreaterThanOrEqual(0);
  expect(sourceX + sourceSize).toBeLessThanOrEqual(context.state.imageWidth);
  expect(sourceY + sourceSize).toBeLessThanOrEqual(context.state.imageHeight);
};

describe("cropper gestures", () => {
  it("drags a wide image with one finger and stops after release", () => {
    const { store } = createCropper(1280, 640);
    store.startPointer({ pointerId: 1, x: 160, y: 160 });
    store.movePointer({ pointerId: 1, x: 200, y: 200 });
    expect(store.selectCropSelection()).toMatchObject({
      sourceX: 240,
      sourceY: 0,
    });
    store.endPointer({ pointerId: 1 });
    store.movePointer({ pointerId: 1, x: 100, y: 100 });
    expect(store.selectIsDragging()).toBe(false);
    expect(store.selectCropSelection()).toMatchObject({
      sourceX: 240,
      sourceY: 0,
    });
  });

  it("pinches around the fingers' midpoint instead of the viewport center", () => {
    const { context, store } = createCropper();
    store.startPointer({ pointerId: 1, x: 60, y: 100 });
    store.startPointer({ pointerId: 2, x: 140, y: 100 });
    store.movePointer({ pointerId: 1, x: 20, y: 100 });
    store.movePointer({ pointerId: 2, x: 180, y: 100 });
    expect(store.selectZoomLevel()).toBeCloseTo(2);
    expect(context.state.offsetX).toBeCloseTo(-100);
    expect(context.state.offsetY).toBeCloseTo(-100);
    expect(store.selectCropSelection()).toMatchObject({
      sourceX: 100,
      sourceY: 100,
      sourceSize: 320,
    });
  });

  it("pans and zooms in both directions during the same two-finger gesture", () => {
    const { context, store } = createCropper();
    store.setZoomLevel({ zoomLevel: 2 });
    store.startPointer({ pointerId: 1, x: 100, y: 160 });
    store.startPointer({ pointerId: 2, x: 220, y: 160 });
    store.movePointer({ pointerId: 1, x: 130, y: 180 });
    store.movePointer({ pointerId: 2, x: 250, y: 180 });
    expect(store.selectZoomLevel()).toBeCloseTo(2);
    expect(context.state.offsetX).toBeCloseTo(-130);
    expect(context.state.offsetY).toBeCloseTo(-140);
    store.movePointer({ pointerId: 1, x: 160, y: 180 });
    store.movePointer({ pointerId: 2, x: 220, y: 180 });
    expect(store.selectZoomLevel()).toBeCloseTo(1);
  });

  it.each([1, 2])(
    "continues dragging without a jump when finger %i lifts",
    (liftedId) => {
      const { context, store } = createCropper();
      store.setZoomLevel({ zoomLevel: 2 });
      store.startPointer({ pointerId: 1, x: 100, y: 160 });
      store.startPointer({ pointerId: 2, x: 220, y: 160 });
      store.endPointer({ pointerId: liftedId });
      expect(context.state.offsetX).toBe(-160);
      const pointerId = liftedId === 1 ? 2 : 1;
      const x = pointerId === 1 ? 100 : 220;
      store.movePointer({ pointerId, x, y: 160 });
      expect(context.state.offsetX).toBe(-160);
      store.movePointer({ pointerId, x: x + 20, y: 175 });
      expect(context.state.offsetX).toBe(-140);
      expect(context.state.offsetY).toBe(-145);
      expect(store.selectZoomLevel()).toBe(2);
    },
  );

  it.each([
    [1280, 640],
    [640, 1280],
    [128, 128],
  ])(
    "keeps a %i by %i image covering the crop viewport at extreme pan and zoom",
    (width, height) => {
      const cropper = createCropper(width, height);
      const { store } = cropper;
      store.startPointer({ pointerId: 1, x: 100, y: 160 });
      store.startPointer({ pointerId: 2, x: 200, y: 160 });
      store.movePointer({ pointerId: 2, x: 20000, y: 160 });
      expect(store.selectZoomLevel()).toBe(
        Math.min(4, Math.min(width, height) / 64),
      );
      expectCropInsideImage(cropper);
      store.endPointer({ pointerId: 2 });
      store.movePointer({ pointerId: 1, x: -20000, y: 20000 });
      expectCropInsideImage(cropper);
      store.movePointer({ pointerId: 1, x: 20000, y: -20000 });
      expectCropInsideImage(cropper);
    },
  );

  it("responds immediately when dragging back from an image edge", () => {
    const { context, store } = createCropper();
    store.setZoomLevel({ zoomLevel: 2 });
    store.startPointer({ pointerId: 1, x: 100, y: 100 });
    store.movePointer({ pointerId: 1, x: 1000, y: 1000 });
    expect(context.state.offsetX).toBe(0);
    store.movePointer({ pointerId: 1, x: 990, y: 990 });
    expect(context.state.offsetX).toBe(-10);
    expect(context.state.offsetY).toBe(-10);
  });

  it("ignores extra fingers and does not let an unrelated release reset the pinch", () => {
    const { store } = createCropper();
    store.startPointer({ pointerId: 1, x: 100, y: 100 });
    store.startPointer({ pointerId: 2, x: 200, y: 100 });
    store.startPointer({ pointerId: 3, x: 250, y: 100 });
    store.movePointer({ pointerId: 3, x: 0, y: 0 });
    store.endPointer({ pointerId: 3 });
    store.movePointer({ pointerId: 2, x: 300, y: 100 });
    expect(store.selectZoomLevel()).toBe(2);
  });

  it("handles coincident fingers without invalid coordinates", () => {
    const { store } = createCropper();
    store.startPointer({ pointerId: 1, x: 100, y: 100 });
    store.startPointer({ pointerId: 2, x: 100, y: 100 });
    store.movePointer({ pointerId: 2, x: 110, y: 100 });
    expect(store.selectZoomLevel()).toBe(1);
    store.movePointer({ pointerId: 2, x: 120, y: 100 });
    expect(store.selectZoomLevel()).toBe(2);
  });

  it("rebases after slider zoom and resets gestures when replacing or clearing the image", () => {
    const { context, store } = createCropper();
    store.startPointer({ pointerId: 1, x: 100, y: 100 });
    store.setZoomLevel({ zoomLevel: 2 });
    store.movePointer({ pointerId: 1, x: 110, y: 100 });
    expect(context.state.offsetX).toBe(-150);
    store.setImage({
      imageUrl: "blob:replacement",
      imageWidth: 640,
      imageHeight: 640,
    });
    expect(store.selectIsDragging()).toBe(false);
    expect(store.selectZoomLevel()).toBe(1);
    store.startPointer({ pointerId: 2, x: 100, y: 100 });
    store.clearImage();
    expect(store.selectIsDragging()).toBe(false);
    expect(store.selectCropSelection()).toBeUndefined();
  });
});

describe("cropper pointer event handling", () => {
  const setup = () => {
    const cropper = createCropper(1280, 640);
    const captured = new Set();
    const deps = {
      store: cropper.store,
      refs: {
        cropViewport: {
          // Also verify coordinate conversion for a scaled viewport.
          getBoundingClientRect: () => ({
            left: 50,
            top: 100,
            width: 160,
            height: 160,
          }),
          setPointerCapture: vi.fn((id) => captured.add(id)),
          hasPointerCapture: (id) => captured.has(id),
          releasePointerCapture: vi.fn((id) => captured.delete(id)),
        },
      },
      render: vi.fn(),
    };
    const event = (overrides = {}) => ({
      _event: {
        pointerId: 1,
        button: 0,
        pointerType: "touch",
        clientX: 100,
        clientY: 150,
        preventDefault: vi.fn(),
        ...overrides,
      },
    });
    return { ...cropper, deps, event };
  };

  it.each(["touch", "mouse", "pen"])(
    "captures %s dragging, including movement outside the viewport",
    (pointerType) => {
      const { store, deps, event } = setup();
      const down = event({ pointerType });
      handlers.handleViewportPointerDown(deps, down);
      expect(down._event.preventDefault).toHaveBeenCalled();
      expect(deps.refs.cropViewport.setPointerCapture).toHaveBeenCalledWith(1);
      handlers.handleWindowPointerMove(
        deps,
        event({ pointerType, clientX: 120 }),
      );
      expect(store.selectCropSelection().sourceX).toBe(240);
      handlers.handleWindowPointerMove(
        deps,
        event({ pointerType, clientX: -100 }),
      );
      expect(store.selectCropSelection().sourceX).toBe(640);
      handlers.handleWindowPointerEnd(deps, event({ pointerType }));
      expect(store.selectIsDragging()).toBe(false);
      expect(deps.refs.cropViewport.releasePointerCapture).toHaveBeenCalledWith(
        1,
      );
    },
  );

  it("ignores secondary mouse buttons and pointers that started outside the cropper", () => {
    const { store, deps, event } = setup();
    const secondary = event({ button: 2, pointerType: "mouse" });
    handlers.handleViewportPointerDown(deps, secondary);
    handlers.handleWindowPointerMove(deps, event());
    handlers.handleWindowPointerEnd(deps, event());
    expect(secondary._event.preventDefault).not.toHaveBeenCalled();
    expect(store.selectIsDragging()).toBe(false);
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("continues with the remaining finger after cancellation and resets on window blur", () => {
    const { store, deps, event } = setup();
    handlers.handleViewportPointerDown(deps, event());
    handlers.handleViewportPointerDown(
      deps,
      event({ pointerId: 2, clientX: 150 }),
    );
    handlers.handleWindowPointerEnd(deps, event({ type: "pointercancel" }));
    expect(store.selectHasPointer({ pointerId: 1 })).toBe(false);
    expect(store.selectHasPointer({ pointerId: 2 })).toBe(true);
    handlers.handleWindowBlur(deps);
    expect(store.selectIsDragging()).toBe(false);
    const renderCount = deps.render.mock.calls.length;
    handlers.handleWindowPointerMove(
      deps,
      event({ pointerId: 2, clientX: 200 }),
    );
    expect(deps.render).toHaveBeenCalledTimes(renderCount);
  });
});
