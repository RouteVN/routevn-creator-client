import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleAfterMount,
  handleOnUpdate,
  renderWaveformCanvas,
} from "../../src/components/waveformVisualizer/waveformVisualizer.handlers.js";
import * as waveformStore from "../../src/components/waveformVisualizer/waveformVisualizer.store.js";

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
        cancelWaveformLoad: vi.fn(),
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

  const createWaveform = (
    downloadMetadata = vi.fn(async () => ({ amplitudes: [64, 255] })),
  ) => {
    const props = { waveformDataFileId: "waveform-1", w: "f", h: "f" };
    const state = waveformStore.createInitialState();
    const store = Object.fromEntries(
      Object.entries(waveformStore).map(([name, fn]) => [
        name,
        (payload) => fn({ state, props }, payload),
      ]),
    );
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const canvas = { getContext: () => context };
    const refs = {};
    const render = vi.fn(() => {
      refs.waveformCanvas = store.selectWaveformData() ? canvas : undefined;
    });
    store.setRenderedSize({ width: 120, height: 60 });
    const deps = {
      props,
      store,
      refs,
      render,
      projectService: { downloadMetadata },
    };
    const update = (changes) => {
      const oldProps = { ...props };
      Object.assign(props, changes);
      return handleOnUpdate(deps, { oldProps, newProps: { ...props } });
    };
    return { deps, update, context, downloadMetadata };
  };

  it("reuses loaded waveform data and pixels across unrelated updates", async () => {
    const { deps, update, context, downloadMetadata } = createWaveform();
    await handleAfterMount(deps);
    const renderCount = deps.render.mock.calls.length;

    await update({});
    await update({ selected: true });
    await update({ selected: false });

    expect(downloadMetadata).toHaveBeenCalledExactlyOnceWith("waveform-1");
    expect(context.clearRect).toHaveBeenCalledOnce();
    expect(deps.render).toHaveBeenCalledTimes(renderCount);
  });

  it("redraws resized waveforms without downloading their data again", async () => {
    const { deps, update, context, downloadMetadata } = createWaveform();
    let notifyResize;
    let runFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      runFrame = callback;
      return 1;
    });
    globalThis.cancelAnimationFrame = vi.fn();
    globalThis.ResizeObserver = class {
      constructor(callback) {
        notifyResize = callback;
      }
      observe() {}
      disconnect() {}
    };
    deps.refs.waveformContainer = {
      getBoundingClientRect: () => ({ width: 120, height: 60 }),
    };
    const cleanup = handleBeforeMount(deps);
    runFrame();
    await handleAfterMount(deps);

    await update({ w: "240" });
    notifyResize([{ contentRect: { width: 120.2, height: 60.2 } }]);
    expect(context.clearRect).toHaveBeenCalledOnce();
    notifyResize([{ contentRect: { width: 240, height: 120 } }]);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 240, 120);
    expect(downloadMetadata).toHaveBeenCalledOnce();
    cleanup();
  });

  it("shares an in-flight data load across repeated updates", async () => {
    let resolveData;
    const downloadMetadata = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveData = resolve;
        }),
    );
    const { deps, update, context } = createWaveform(downloadMetadata);
    const mounted = handleAfterMount(deps);
    await update({});
    await update({ h: "100" });
    expect(downloadMetadata).toHaveBeenCalledOnce();

    resolveData({ amplitudes: [255] });
    await mounted;
    expect(context.clearRect).toHaveBeenCalledOnce();
  });

  it("ignores an older data load after switching waveform IDs", async () => {
    const resolvers = new Map();
    const downloadMetadata = vi.fn(
      (id) =>
        new Promise((resolve) => {
          resolvers.set(id, resolve);
        }),
    );
    const { deps, update, context } = createWaveform(downloadMetadata);
    const first = handleAfterMount(deps);
    const second = update({ waveformDataFileId: "waveform-2" });
    resolvers.get("waveform-2")({ amplitudes: [200] });
    await second;
    resolvers.get("waveform-1")({ amplitudes: [100] });
    await first;

    expect(deps.store.selectWaveformData()).toEqual({ amplitudes: [200] });
    expect(deps.store.selectWaveformLoad().loadedFileId).toBe("waveform-2");
    expect(context.clearRect).toHaveBeenCalledOnce();
  });

  it("clears a removed waveform and ignores its unfinished load", async () => {
    let resolveData;
    const { deps, update, context } = createWaveform(
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveData = resolve;
          }),
      ),
    );
    const mounted = handleAfterMount(deps);
    await update({ waveformDataFileId: undefined });
    const renderCount = deps.render.mock.calls.length;
    resolveData({ amplitudes: [255] });
    await mounted;

    expect(deps.store.selectWaveformData()).toBeUndefined();
    expect(deps.render).toHaveBeenCalledTimes(renderCount);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it("allows a failed data load to retry on the next update", async () => {
    const downloadMetadata = vi
      .fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValue({ amplitudes: [255] });
    const { deps, update, context } = createWaveform(downloadMetadata);
    await handleAfterMount(deps);
    await update({});

    expect(downloadMetadata).toHaveBeenCalledTimes(2);
    expect(deps.store.selectWaveformLoad().loadedFileId).toBe("waveform-1");
    expect(context.clearRect).toHaveBeenCalledOnce();
  });

  it("does not render an unfinished load after unmounting", async () => {
    let resolveData;
    const { deps, context } = createWaveform(
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveData = resolve;
          }),
      ),
    );
    globalThis.requestAnimationFrame = vi.fn(() => 1);
    globalThis.cancelAnimationFrame = vi.fn();
    const cleanup = handleBeforeMount(deps);
    const mounted = handleAfterMount(deps);
    cleanup();
    const renderCount = deps.render.mock.calls.length;
    resolveData({ amplitudes: [255] });
    await mounted;

    expect(deps.render).toHaveBeenCalledTimes(renderCount);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it("retries an interrupted load after reconnecting and ignores the old result", async () => {
    const resolveLoads = [];
    const downloadMetadata = vi.fn(
      () => new Promise((resolve) => resolveLoads.push(resolve)),
    );
    const { deps, context } = createWaveform(downloadMetadata);
    globalThis.requestAnimationFrame = vi.fn(() => 1);
    globalThis.cancelAnimationFrame = vi.fn();
    const cleanup = handleBeforeMount(deps);
    const firstLoad = handleAfterMount(deps);
    cleanup();
    const reconnectedCleanup = handleBeforeMount(deps);
    const secondLoad = handleAfterMount(deps);
    expect(downloadMetadata).toHaveBeenCalledTimes(2);

    resolveLoads[0]({ amplitudes: [100] });
    await firstLoad;
    expect(deps.store.selectWaveformData()).toBeUndefined();
    expect(context.clearRect).not.toHaveBeenCalled();
    resolveLoads[1]({ amplitudes: [200] });
    await secondLoad;
    expect(deps.store.selectWaveformData()).toEqual({ amplitudes: [200] });
    expect(context.clearRect).toHaveBeenCalledOnce();
    reconnectedCleanup();
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
