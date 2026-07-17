import { afterEach, describe, expect, it, vi } from "vitest";
import { handleBeforeMount } from "../../src/components/waveformVisualizer/waveformVisualizer.handlers.js";

const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

describe("waveformVisualizer.handlers", () => {
  it("rerenders the waveform when its rendered size changes", () => {
    let runAnimationFrame;
    let notifyResize;
    let renderedSize = { width: 0, height: 0 };
    const container = {
      getBoundingClientRect: vi.fn(() => ({ width: 120, height: 60 })),
    };
    const observe = vi.fn();
    const disconnect = vi.fn();
    const setRenderedSize = vi.fn((size) => {
      renderedSize = size;
    });
    const render = vi.fn();

    globalThis.requestAnimationFrame = vi.fn((callback) => {
      runAnimationFrame = callback;
      return 7;
    });
    globalThis.cancelAnimationFrame = vi.fn();
    globalThis.ResizeObserver = class {
      constructor(callback) {
        notifyResize = callback;
      }

      observe = observe;
      disconnect = disconnect;
    };

    const cleanup = handleBeforeMount({
      refs: { waveformContainer: container },
      store: {
        selectRenderedSize: () => renderedSize,
        setRenderedSize,
      },
      render,
    });

    runAnimationFrame();

    expect(setRenderedSize).toHaveBeenLastCalledWith({
      width: 120,
      height: 60,
    });
    expect(render).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(container);

    notifyResize([{ contentRect: { width: 120.2, height: 60.2 } }]);
    expect(render).toHaveBeenCalledTimes(1);

    notifyResize([{ contentRect: { width: 240, height: 120 } }]);
    expect(setRenderedSize).toHaveBeenLastCalledWith({
      width: 240,
      height: 120,
    });
    expect(render).toHaveBeenCalledTimes(2);

    cleanup();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
