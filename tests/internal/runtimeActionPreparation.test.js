import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureCanvasThumbnailImage,
  preloadRuntimeSaveSlotImages,
  prepareRuntimeInteractionExecution,
  prepareRuntimeInteractionActions,
} from "../../src/internal/runtime/graphicsEngineRuntime.js";

const createThumbnailCanvas = (result) => {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  };

  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn(() => result),
    remove: vi.fn(),
    context,
  };
};

class FakeImage {
  naturalWidth = 1920;
  naturalHeight = 1080;

  set src(value) {
    this._src = value;
    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

describe("captureCanvasThumbnailImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downscales RouteGraphics base64 captures before saving", async () => {
    const thumbnailCanvas = createThumbnailCanvas(
      "data:image/jpeg;base64,thumb",
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => thumbnailCanvas),
    });
    vi.stubGlobal("Image", FakeImage);

    const graphicsService = {
      extractBase64: vi.fn(async () => "data:image/png;base64,full"),
    };

    const result = await captureCanvasThumbnailImage(graphicsService);

    expect(graphicsService.extractBase64).toHaveBeenCalledWith("story");
    expect(thumbnailCanvas.width).toBe(400);
    expect(thumbnailCanvas.height).toBe(225);
    expect(thumbnailCanvas.getContext).toHaveBeenCalledWith("2d");
    expect(thumbnailCanvas.context.drawImage).toHaveBeenCalledTimes(1);
    expect(thumbnailCanvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.75);
    expect(result).toBe("data:image/jpeg;base64,thumb");
  });

  it("downscales DOM canvas fallback captures before saving", async () => {
    const thumbnailCanvas = createThumbnailCanvas(
      "data:image/jpeg;base64,thumb-fallback",
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => thumbnailCanvas),
    });

    const sourceCanvas = {
      width: 1280,
      height: 720,
      toDataURL: vi.fn(() => "data:image/jpeg;base64,full"),
    };
    const canvasRoot = {
      querySelector: vi.fn(() => sourceCanvas),
    };

    const result = await captureCanvasThumbnailImage(undefined, canvasRoot);

    expect(canvasRoot.querySelector).toHaveBeenCalledWith("canvas");
    expect(thumbnailCanvas.width).toBe(400);
    expect(thumbnailCanvas.height).toBe(225);
    expect(thumbnailCanvas.context.drawImage).toHaveBeenCalledWith(
      sourceCanvas,
      0,
      0,
      400,
      225,
    );
    expect(result).toBe("data:image/jpeg;base64,thumb-fallback");
  });
});

describe("prepareRuntimeInteractionActions", () => {
  it("fills save slot bindings from event data without resolving other event templates", () => {
    const actions = {
      saveSlot: {},
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
      showConfirmDialog: {
        confirmActions: {
          saveSlot: {},
          loadSlot: {},
        },
      },
    };

    const result = prepareRuntimeInteractionActions(actions, {
      slotId: 3,
      value: 42,
    });

    expect(result).toEqual({
      saveSlot: {
        slotId: 3,
      },
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
      showConfirmDialog: {
        confirmActions: {
          saveSlot: {
            slotId: 3,
          },
          loadSlot: {
            slotId: 3,
          },
        },
      },
    });
    expect(actions).toEqual({
      saveSlot: {},
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
      showConfirmDialog: {
        confirmActions: {
          saveSlot: {},
          loadSlot: {},
        },
      },
    });
  });

  it("fills nested confirm and cancel save/load bindings without overwriting explicit values", () => {
    const actions = {
      showConfirmDialog: {
        confirmActions: {
          saveSlot: {
            slotId: 99,
          },
          loadSlot: {},
        },
        cancelActions: {
          saveSlot: {
            thumbnailImage: "data:image/jpeg;base64,existing",
          },
          loadSlot: {
            slotId: 5,
          },
        },
      },
    };

    const result = prepareRuntimeInteractionActions(actions, {
      slotId: 3,
    });

    expect(result).toEqual({
      showConfirmDialog: {
        confirmActions: {
          saveSlot: {
            slotId: 99,
          },
          loadSlot: {
            slotId: 3,
          },
        },
        cancelActions: {
          saveSlot: {
            slotId: 3,
            thumbnailImage: "data:image/jpeg;base64,existing",
          },
          loadSlot: {
            slotId: 5,
          },
        },
      },
    });
    expect(actions).toEqual({
      showConfirmDialog: {
        confirmActions: {
          saveSlot: {
            slotId: 99,
          },
          loadSlot: {},
        },
        cancelActions: {
          saveSlot: {
            thumbnailImage: "data:image/jpeg;base64,existing",
          },
          loadSlot: {
            slotId: 5,
          },
        },
      },
    });
  });
});

describe("prepareRuntimeInteractionExecution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fills nested save actions and preloads thumbnail images through the shared runtime helper", async () => {
    const thumbnailCanvas = createThumbnailCanvas(
      "data:image/jpeg;base64,thumb-save",
    );
    vi.stubGlobal("document", {
      createElement: vi.fn(() => thumbnailCanvas),
    });
    vi.stubGlobal("Image", FakeImage);

    const graphicsService = {
      extractBase64: vi.fn(async () => "data:image/png;base64,full-save"),
      loadAssets: vi.fn(async () => {}),
      hasLoadedAsset: vi.fn(() => false),
    };

    const result = await prepareRuntimeInteractionExecution({
      actions: {
        showConfirmDialog: {
          confirmActions: {
            saveSlot: {},
          },
        },
      },
      eventContext: {
        _event: {
          slotId: 7,
        },
      },
      graphicsService,
      captureThumbnail: "save-only",
    });

    expect(result.preparedActions).toEqual({
      showConfirmDialog: {
        confirmActions: {
          saveSlot: {
            slotId: 7,
            thumbnailImage: "data:image/jpeg;base64,thumb-save",
          },
        },
      },
    });
    expect(graphicsService.loadAssets).toHaveBeenCalledWith({
      "data:image/jpeg;base64,thumb-save": {
        source: "url",
        url: "data:image/jpeg;base64,thumb-save",
        type: "image/jpeg",
      },
    });
    expect(result.thumbnailPreloadError).toBeUndefined();
  });
});

describe("preloadRuntimeSaveSlotImages", () => {
  it("preloads unique saved thumbnail data urls from restored save slots", async () => {
    const graphicsService = {
      loadAssets: vi.fn(async () => {}),
      hasLoadedAsset: vi.fn(() => false),
    };

    const result = await preloadRuntimeSaveSlotImages(graphicsService, {
      "slot:1": {
        image: "data:image/jpeg;base64,one",
      },
      "slot:2": {
        image: "data:image/jpeg;base64,two",
      },
      "slot:3": {
        image: "data:image/jpeg;base64,one",
      },
      "slot:4": {
        image: "blob:https://example.com/not-a-data-url",
      },
    });

    expect(graphicsService.loadAssets).toHaveBeenCalledTimes(2);
    expect(graphicsService.loadAssets).toHaveBeenNthCalledWith(1, {
      "data:image/jpeg;base64,one": {
        source: "url",
        url: "data:image/jpeg;base64,one",
        type: "image/jpeg",
      },
    });
    expect(graphicsService.loadAssets).toHaveBeenNthCalledWith(2, {
      "data:image/jpeg;base64,two": {
        source: "url",
        url: "data:image/jpeg;base64,two",
        type: "image/jpeg",
      },
    });
    expect(result).toEqual({
      attempted: 2,
      failed: 0,
    });
  });
});
