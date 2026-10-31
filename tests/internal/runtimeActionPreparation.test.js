import { afterEach, describe, expect, it, vi } from "vitest";
import createRouteEngine from "route-engine-js";
import { constructProjectData } from "../../src/internal/project/projection.js";
import {
  captureCanvasImage,
  captureCanvasThumbnailImage,
  createSafeSpritePlugin,
  createSafeSpritesheetAnimationPlugin,
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

describe("createSafeSpritePlugin", () => {
  it("replaces a stale animated display object before sprite update", async () => {
    const staleDisplay = {
      label: "sprite-1",
      play: vi.fn(),
      stop: vi.fn(),
      removeFromParent: vi.fn(),
      destroy: vi.fn(),
    };
    const parent = {
      children: [staleDisplay],
    };
    const nextElement = {
      id: "sprite-1",
    };
    const plugin = {
      type: "sprite",
      add: vi.fn(async () => "added"),
      update: vi.fn(async () => "updated"),
    };

    const wrappedPlugin = createSafeSpritePlugin(plugin);
    const result = await wrappedPlugin.update({
      parent,
      prevElement: { id: "sprite-1" },
      nextElement,
      zIndex: 2,
    });

    expect(result).toBe("added");
    expect(plugin.update).not.toHaveBeenCalled();
    expect(staleDisplay.stop).toHaveBeenCalledTimes(1);
    expect(staleDisplay.removeFromParent).toHaveBeenCalledTimes(1);
    expect(staleDisplay.destroy).toHaveBeenCalledWith({ children: true });
    expect(plugin.add).toHaveBeenCalledWith(
      expect.objectContaining({
        element: nextElement,
        parent,
        zIndex: 2,
      }),
    );
  });

  it("delegates sprite updates for normal display objects", async () => {
    const display = {
      label: "sprite-1",
      removeFromParent: vi.fn(),
      destroy: vi.fn(),
    };
    const parent = {
      children: [display],
    };
    const plugin = {
      type: "sprite",
      add: vi.fn(async () => "added"),
      update: vi.fn(async () => "updated"),
    };

    const wrappedPlugin = createSafeSpritePlugin(plugin);
    const result = await wrappedPlugin.update({
      parent,
      prevElement: { id: "sprite-1" },
      nextElement: { id: "sprite-1" },
    });

    expect(result).toBe("updated");
    expect(plugin.update).toHaveBeenCalledTimes(1);
    expect(plugin.add).not.toHaveBeenCalled();
    expect(display.removeFromParent).not.toHaveBeenCalled();
    expect(display.destroy).not.toHaveBeenCalled();
  });
});

describe("createSafeSpritesheetAnimationPlugin", () => {
  it("replaces a stale non-animated display object before spritesheet update", async () => {
    const staleDisplay = {
      label: "sprite-1",
      stop: vi.fn(),
      removeFromParent: vi.fn(),
      destroy: vi.fn(),
    };
    const parent = {
      children: [staleDisplay],
    };
    const nextElement = {
      id: "sprite-1",
    };
    const plugin = {
      type: "spritesheet-animation",
      add: vi.fn(async () => "added"),
      update: vi.fn(async () => "updated"),
    };

    const wrappedPlugin = createSafeSpritesheetAnimationPlugin(plugin);
    const result = await wrappedPlugin.update({
      parent,
      prevElement: { id: "sprite-1" },
      nextElement,
      zIndex: 2,
    });

    expect(result).toBe("added");
    expect(plugin.update).not.toHaveBeenCalled();
    expect(staleDisplay.stop).toHaveBeenCalledTimes(1);
    expect(staleDisplay.removeFromParent).toHaveBeenCalledTimes(1);
    expect(staleDisplay.destroy).toHaveBeenCalledWith({ children: true });
    expect(plugin.add).toHaveBeenCalledWith(
      expect.objectContaining({
        element: nextElement,
        parent,
        zIndex: 2,
      }),
    );
  });

  it("falls back to replacement when RouteGraphics throws a missing play method error", async () => {
    const display = {
      label: "sprite-1",
      play: vi.fn(),
      stop: vi.fn(),
      removeFromParent: vi.fn(),
      destroy: vi.fn(),
    };
    const parent = {
      children: [display],
    };
    const nextElement = {
      id: "sprite-1",
    };
    const plugin = {
      type: "spritesheet-animation",
      add: vi.fn(async () => "added"),
      update: vi.fn(async () => {
        throw new TypeError("c.play is not a function");
      }),
    };

    const wrappedPlugin = createSafeSpritesheetAnimationPlugin(plugin);
    const result = await wrappedPlugin.update({
      parent,
      prevElement: { id: "sprite-1" },
      nextElement,
    });

    expect(result).toBe("added");
    expect(plugin.update).toHaveBeenCalledTimes(1);
    expect(display.stop).toHaveBeenCalledTimes(1);
    expect(display.removeFromParent).toHaveBeenCalledTimes(1);
    expect(display.destroy).toHaveBeenCalledWith({ children: true });
    expect(plugin.add).toHaveBeenCalledWith(
      expect.objectContaining({
        element: nextElement,
        parent,
      }),
    );
  });
});

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

describe("captureCanvasImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps RouteGraphics base64 captures at full size", async () => {
    const graphicsService = {
      extractBase64: vi.fn(async () => "data:image/png;base64,full"),
    };

    const result = await captureCanvasImage(graphicsService);

    expect(graphicsService.extractBase64).toHaveBeenCalledWith("story");
    expect(result).toBe("data:image/png;base64,full");
  });

  it("keeps DOM canvas fallback captures at full size", async () => {
    const sourceCanvas = {
      width: 1280,
      height: 720,
      toDataURL: vi.fn(() => "data:image/png;base64,full-fallback"),
    };
    const canvasRoot = {
      querySelector: vi.fn(() => sourceCanvas),
    };

    const result = await captureCanvasImage(undefined, canvasRoot);

    expect(canvasRoot.querySelector).toHaveBeenCalledWith("canvas");
    expect(sourceCanvas.toDataURL).toHaveBeenCalledWith();
    expect(result).toBe("data:image/png;base64,full-fallback");
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

describe("prepareRuntimeInteractionActions without a slot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves out save and load slot actions that have no slot to use", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const actions = {
      loadSlot: {},
      saveSlot: { slotId: "" },
      updateVariable: {
        id: "update-1",
        operations: [{ variableId: "var-1", op: "set", value: 1 }],
      },
      showConfirmDialog: {
        confirmActions: {
          loadSlot: { slotId: null },
          hideConfirmDialog: {},
        },
        cancelActions: {
          saveSlot: {},
        },
      },
    };

    const result = prepareRuntimeInteractionActions(actions, {});

    expect(result).toEqual({
      updateVariable: {
        id: "update-1",
        operations: [{ variableId: "var-1", op: "set", value: 1 }],
      },
      showConfirmDialog: {
        confirmActions: {
          hideConfirmDialog: {},
        },
        cancelActions: {},
      },
    });
    expect(warn).toHaveBeenCalledTimes(4);
    expect(actions.loadSlot).toEqual({});
    expect(actions.showConfirmDialog.cancelActions.saveSlot).toEqual({});
  });

  it("keeps slot actions whose slot is set or comes from the clicked item", () => {
    const result = prepareRuntimeInteractionActions(
      {
        loadSlot: { slotId: 0 },
        saveSlot: { slotId: "${slot.slotId}" },
        showConfirmDialog: {
          confirmActions: {
            loadSlot: {},
          },
        },
      },
      { slotId: 2 },
    );

    expect(result).toEqual({
      loadSlot: { slotId: 0 },
      saveSlot: { slotId: "${slot.slotId}" },
      showConfirmDialog: {
        confirmActions: {
          loadSlot: { slotId: 2 },
        },
      },
    });
  });

  it("captures no save thumbnail when the save slot action is left out", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const graphicsService = {
      extractBase64: vi.fn(async () => "data:image/png;base64,full"),
    };

    const result = await prepareRuntimeInteractionExecution({
      actions: { saveSlot: {} },
      eventContext: { _event: {} },
      graphicsService,
    });

    expect(result.preparedActions).toEqual({});
    expect(graphicsService.extractBase64).not.toHaveBeenCalled();
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

const createTreeCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

const startRouteEngine = () => {
  const projectData = constructProjectData({
    project: { resolution: { width: 1920, height: 1080 } },
    story: { initialSceneId: "scene-1" },
    scenes: createTreeCollection({
      "scene-1": {
        id: "scene-1",
        type: "scene",
        name: "Scene One",
        sections: createTreeCollection({
          "section-1": {
            id: "section-1",
            name: "Section One",
            lines: createTreeCollection({
              "line-1": { id: "line-1", actions: {} },
            }),
          },
        }),
      },
    }),
  });
  let engine;
  engine = createRouteEngine({
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions") {
          engine.handleLineActions();
        }
      }
    },
  });
  engine.init({ initialState: { global: {}, projectData } });
  return engine;
};

// Runs an interaction the way the scene editor, the preview, and the exported
// player do: the actions are prepared for the event, then Route Engine runs
// them with it.
const runInteraction = (engine, actions, eventData) => {
  engine.handleActions(prepareRuntimeInteractionActions(actions, eventData), {
    _event: eventData,
  });
};

describe("prepareRuntimeInteractionActions with event values", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves out actions that use a value the event does not have", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const actions = {
      setMusicVolume: { value: "_event.value" },
      saveSlot: { slotId: "_event.slotId" },
      updateVariable: {
        id: "update-1",
        operations: [{ variableId: "var-1", op: "set", value: "_event.value" }],
      },
      toggleAutoMode: {},
    };

    expect(
      prepareRuntimeInteractionActions(actions, { id: "button-1" }),
    ).toEqual({ toggleAutoMode: {} });
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(
      "[runtime] Skipped setMusicVolume: the event that ran it has no _event.value.",
    );
    expect(actions.setMusicVolume).toEqual({ value: "_event.value" });
    expect(
      prepareRuntimeInteractionActions(
        { setMusicVolume: { value: "_event.value" } },
        undefined,
      ),
    ).toEqual({});
  });

  it("keeps actions whose values the event has", () => {
    const actions = {
      setMusicVolume: { value: "_event.value" },
      saveSlot: { slotId: "_event.slotId" },
      updateVariable: {
        id: "update-1",
        operations: [
          { variableId: "var-1", op: "set", value: "_event" },
          { variableId: "var-2", op: "set", value: "_event.label" },
        ],
      },
    };

    expect(
      prepareRuntimeInteractionActions(actions, {
        value: 30,
        slotId: 2,
        label: null,
      }),
    ).toEqual(actions);
  });

  it("leaves a confirm dialog's actions for the click on its button", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const showConfirmDialog = {
      resourceId: "confirm-layout",
      confirmActions: { setMusicVolume: { value: "_event.value" } },
    };

    expect(
      prepareRuntimeInteractionActions(
        { showConfirmDialog },
        { id: "button-1" },
      ),
    ).toEqual({ showConfirmDialog });
    expect(
      prepareRuntimeInteractionActions(
        {
          hideConfirmDialog: {},
          setMusicVolume: { value: "_event.value" },
        },
        { id: "confirm-button" },
      ),
    ).toEqual({ hideConfirmDialog: {} });
  });

  it("keeps presentation actions, which Route Engine runs as they are", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const dialogue = { content: [{ text: "_event.value" }] };
    const clickEvent = { id: "button-1" };

    // Only a music action's audio effects are resolved from the event.
    expect(
      prepareRuntimeInteractionActions(
        {
          dialogue,
          bgm: {
            resourceId: "bgm-1",
            audioEffects: { resourceId: "_event.value" },
          },
        },
        clickEvent,
      ),
    ).toEqual({ dialogue });
    expect(() =>
      startRouteEngine().handleActions(structuredClone({ dialogue }), {
        _event: clickEvent,
      }),
    ).not.toThrow();
  });

  it("lets Route Engine run a click whose saved action uses Current Value", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const actions = {
      setMusicVolume: { value: "_event.value" },
      setSoundVolume: { value: 20 },
    };
    const clickEvent = { id: "button-1" };

    expect(() =>
      startRouteEngine().handleActions(structuredClone(actions), {
        _event: clickEvent,
      }),
    ).toThrow(
      'Action template binding "_event.value" could not be resolved from "_event".',
    );

    const clickEngine = startRouteEngine();
    runInteraction(clickEngine, actions, clickEvent);
    expect(clickEngine.selectSystemState().global).toMatchObject({
      musicVolume: 50,
      soundVolume: 20,
    });

    const sliderEngine = startRouteEngine();
    runInteraction(sliderEngine, actions, { id: "slider-1", value: 30 });
    expect(sliderEngine.selectSystemState().global).toMatchObject({
      musicVolume: 30,
      soundVolume: 20,
    });
  });
});
