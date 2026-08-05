import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  renderWaveformCanvas,
} from "../../src/components/waveformVisualizer/waveformVisualizer.handlers.js";

const originalResizeObserver = globalThis.ResizeObserver;
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

describe("waveformVisualizer.handlers", () => {
  it("tracks changes to the waveform's rendered size", () => {
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
        selectWaveformData: () => undefined,
        setRenderedSize,
      },
    });

    runAnimationFrame();

    expect(setRenderedSize).toHaveBeenLastCalledWith({
      width: 120,
      height: 60,
    });
    expect(observe).toHaveBeenCalledWith(container);

    notifyResize([{ contentRect: { width: 120.2, height: 60.2 } }]);
    expect(setRenderedSize).toHaveBeenCalledTimes(1);

    notifyResize([{ contentRect: { width: 240, height: 120 } }]);
    expect(setRenderedSize).toHaveBeenLastCalledWith({
      width: 240,
      height: 120,
    });
    expect(setRenderedSize).toHaveBeenCalledTimes(2);

    cleanup();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("downsamples the complete waveform into the canvas width", () => {
    const fillRect = vi.fn();
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      fillRect,
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      stroke: vi.fn(),
    };
    const canvas = {
      getContext: vi.fn(() => context),
      width: 0,
      height: 0,
    };

    renderWaveformCanvas({
      canvas,
      waveformData: {
        amplitudes: [255, 200, 64, 32, 192, 128, 16, 8],
      },
      width: 4,
      height: 100,
    });

    expect(canvas.width).toBe(4);
    expect(canvas.height).toBe(100);
    expect(fillRect).toHaveBeenCalledTimes(5);
    expect(
      fillRect.mock.calls.slice(1).map(([x, , barWidth]) => [x, barWidth]),
    ).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    expect(
      fillRect.mock.calls.slice(1).map(([, , , barHeight]) => barHeight),
    ).toEqual([85, (64 / 255) * 85, 64, (16 / 255) * 85]);
  });
});
