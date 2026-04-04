import { beforeEach, describe, expect, it, vi } from "vitest";

const createAssetBufferManagerMock = vi.fn();
const createRouteGraphicsMock = vi.fn();
const createRouteEngineMock = vi.fn();
const createEffectsHandlerMock = vi.fn(() => vi.fn());
let routeGraphicsInitOptions;

const routeGraphicsInstance = {
  init: vi.fn(async (options) => {
    routeGraphicsInitOptions = options;
  }),
  destroy: vi.fn(),
  loadAssets: vi.fn(async () => {}),
  render: vi.fn(),
  canvas: {
    style: {},
  },
};

const assetsCache = new Map();
const assetsApi = {
  cache: {
    has: vi.fn((key) => assetsCache.has(key)),
    get: vi.fn((key) => assetsCache.get(key)),
    remove: vi.fn((key) => assetsCache.delete(key)),
  },
  unload: vi.fn(async () => {}),
};

const audioAssetApi = {
  getAsset: vi.fn(() => undefined),
  load: vi.fn(async () => {}),
  unload: vi.fn(async () => {}),
  remove: vi.fn(),
  clear: vi.fn(),
  reset: vi.fn(),
};

vi.mock("route-graphics", () => ({
  default: createRouteGraphicsMock,
  Assets: assetsApi,
  AudioAsset: audioAssetApi,
  createAssetBufferManager: createAssetBufferManagerMock,
  textPlugin: {},
  rectPlugin: {},
  spritePlugin: {},
  sliderPlugin: {},
  containerPlugin: {},
  textRevealingPlugin: {},
  videoPlugin: {},
  tweenPlugin: {},
  soundPlugin: {},
}));

vi.mock("route-engine-js", () => ({
  default: createRouteEngineMock,
  createEffectsHandler: createEffectsHandlerMock,
}));

vi.mock("pixi.js", () => ({
  Rectangle: class Rectangle {},
  Ticker: class Ticker {
    start() {}
    stop() {}
  },
}));

describe("graphicsService", () => {
  beforeEach(() => {
    routeGraphicsInitOptions = undefined;
    assetsCache.clear();
    audioAssetApi.getAsset = vi.fn(() => undefined);
    audioAssetApi.load = vi.fn(async () => {});
    audioAssetApi.unload = vi.fn(async () => {});
    audioAssetApi.remove = vi.fn();
    audioAssetApi.clear = vi.fn();
    audioAssetApi.reset = vi.fn();
    routeGraphicsInstance.init.mockClear();
    routeGraphicsInstance.destroy.mockClear();
    routeGraphicsInstance.loadAssets.mockClear();
    routeGraphicsInstance.render.mockClear();
    createAssetBufferManagerMock.mockReset();
    createRouteGraphicsMock.mockReset();
    createRouteEngineMock.mockReset();
    createEffectsHandlerMock.mockClear();
    assetsApi.unload.mockClear();
    assetsApi.cache.has.mockClear();
    assetsApi.cache.get.mockClear();
    assetsApi.cache.remove.mockClear();
    audioAssetApi.getAsset.mockClear();
    audioAssetApi.load.mockClear();
    audioAssetApi.unload.mockClear();
    audioAssetApi.remove.mockClear();
    audioAssetApi.clear.mockClear();
    audioAssetApi.reset.mockClear();

    createRouteGraphicsMock.mockReturnValue(routeGraphicsInstance);
    createRouteEngineMock.mockReturnValue({
      init: vi.fn(),
      selectRenderState: vi.fn(() => ({
        id: "render-1",
        elements: [],
        audio: [],
        animations: [],
      })),
      selectPresentationState: vi.fn(() => undefined),
      selectPresentationChanges: vi.fn(() => undefined),
      selectSectionLineChanges: vi.fn(() => []),
      handleActions: vi.fn(),
    });
  });

  it("ignores stale queued asset loads after runtime destroy", async () => {
    let resolveLoad;
    const bufferManager = {
      has: vi.fn(() => false),
      load: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveLoad = resolve;
          }),
      ),
      getBufferMap: vi.fn(() => ({
        "image-1": {
          buffer: new ArrayBuffer(8),
          type: "image/png",
        },
      })),
      clear: vi.fn(),
    };
    createAssetBufferManagerMock.mockReturnValue(bufferManager);

    const { createGraphicsService } = await import(
      "../../src/deps/services/graphicsService.js"
    );
    const service = await createGraphicsService({
      subject: {
        dispatch: vi.fn(),
      },
    });

    await service.init({
      canvas: {
        children: [],
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      width: 1920,
      height: 1080,
    });

    const pendingLoad = service.loadAssets({
      "image-1": {
        url: "data:image/png;base64,AA==",
        type: "image/png",
      },
    });

    await Promise.resolve();
    await service.destroy();
    resolveLoad();

    await expect(pendingLoad).resolves.toBeUndefined();
    expect(routeGraphicsInstance.loadAssets).not.toHaveBeenCalled();
  });

  it("uses actions returned from beforeHandleActions without mutating the original interaction payload", async () => {
    const handleActions = vi.fn();
    createRouteEngineMock.mockReturnValue({
      init: vi.fn(),
      selectRenderState: vi.fn(() => ({
        id: "render-1",
        elements: [],
        audio: [],
        animations: [],
      })),
      selectPresentationState: vi.fn(() => undefined),
      selectPresentationChanges: vi.fn(() => undefined),
      selectSectionLineChanges: vi.fn(() => []),
      handleActions,
    });

    const { createGraphicsService } = await import(
      "../../src/deps/services/graphicsService.js"
    );
    const service = await createGraphicsService({
      subject: {
        dispatch: vi.fn(),
      },
    });

    await service.init({
      canvas: {
        children: [],
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
      width: 1920,
      height: 1080,
      beforeHandleActions: async (actions) => {
        const nextActions = structuredClone(actions);
        nextActions.toggleSkipMode = {};
        return nextActions;
      },
    });

    service.initRouteEngine({
      screen: { width: 1920, height: 1080 },
      story: { scenes: {} },
      resources: {},
    });

    const originalActions = {
      updateVariable: {
        id: "update-1",
        operations: [
          {
            variableId: "var-1",
            op: "set",
            value: "_event.value",
          },
        ],
      },
    };

    routeGraphicsInitOptions.eventHandler("change", {
      _event: {
        id: "slider-1",
        value: 42,
      },
      actions: originalActions,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handleActions).toHaveBeenCalledWith(
      {
        updateVariable: {
          id: "update-1",
          operations: [
            {
              variableId: "var-1",
              op: "set",
              value: "_event.value",
            },
          ],
        },
        toggleSkipMode: {},
      },
      {
        _event: {
          id: "slider-1",
          value: 42,
        },
      },
    );
    expect(originalActions).toEqual({
      updateVariable: {
        id: "update-1",
        operations: [
          {
            variableId: "var-1",
            op: "set",
            value: "_event.value",
          },
        ],
      },
    });
  });
});
