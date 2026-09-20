import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructProjectDataMock = vi.fn();
const extractInitialHybridSceneIdsMock = vi.fn(() => []);
const extractTransitionTargetSceneIdsMock = vi.fn(() => []);
const withPreviewEntryPointMock = vi.fn((projectData) => projectData);
const collectPreviewMissingTargetsMock = vi.fn(() => ({
  missingSceneIds: [],
  missingSectionIds: [],
}));
const ensurePreviewProjectDataTargetsMock = vi.fn(
  async ({ projectData, loadedSceneIds }) => ({
    didLoad: false,
    projectData,
    loadedSceneIds,
  }),
);
const resolveSceneIdForSectionIdMock = vi.fn(() => undefined);

vi.mock("../../src/internal/project/projection.js", () => ({
  constructProjectData: constructProjectDataMock,
}));

vi.mock("../../src/internal/project/layout.js", () => ({
  extractFileIdsForLayouts: vi.fn(() => []),
  extractSceneIdsFromValue: vi.fn(() => []),
  extractFileIdsForScenes: vi.fn(() => []),
  extractInitialHybridSceneIds: extractInitialHybridSceneIdsMock,
  extractLayoutIdsFromValue: vi.fn(() => []),
  resolveEventBindings: vi.fn(() => ({})),
  extractTransitionTargetSceneIds: extractTransitionTargetSceneIdsMock,
  extractTransitionTargetSceneIdsFromActions: vi.fn(() => []),
}));

vi.mock("../../src/internal/runtime/graphicsEngineRuntime.js", () => ({
  prepareRuntimeInteractionExecution: vi.fn(async ({ actions }) => ({
    eventData: {},
    preparedActions: actions,
    resolvedActions: actions,
  })),
}));

vi.mock(
  "../../src/components/vnPreview/support/vnPreviewProjectData.js",
  () => ({
    collectPreviewMissingTargets: collectPreviewMissingTargetsMock,
    collectSceneIdsFromValue: vi.fn(() => []),
    collectSectionIdsFromValue: vi.fn(() => []),
    ensurePreviewProjectDataTargets: ensurePreviewProjectDataTargetsMock,
    resolveSceneIdForSectionId: resolveSceneIdForSectionIdMock,
    withPreviewEntryPoint: withPreviewEntryPointMock,
  }),
);

describe("vnPreview.handlers", () => {
  it("lists a failed font and both images once, then closes without starting playback", async () => {
    const { handleAfterMount } = await import(
      "../../src/components/vnPreview/vnPreview.handlers.js"
    );
    const { extractFileIdsForLayouts, extractFileIdsForScenes } = await import(
      "../../src/internal/project/layout.js"
    );
    vi.mocked(extractFileIdsForLayouts).mockReturnValueOnce([
      { url: "font-one", type: "font/ttf" },
    ]);
    vi.mocked(extractFileIdsForScenes).mockReturnValueOnce([
      { url: "font-one", type: "font/ttf" },
      { url: "image-one", type: "image/png" },
      { url: "image-two", type: "image/png" },
    ]);
    constructProjectDataMock.mockReturnValue({
      screen: { width: 1280, height: 720 },
      story: { scenes: {} },
      resources: {
        fonts: { font: { fileId: "font-one" } },
        layouts: { dialogue: {} },
      },
    });
    const error = Object.assign(new Error("checksum mismatch"), {
      fileId: "font-one",
      code: "font_integrity_mismatch",
    });
    const deps = {
      projectService: {
        ensureRepository: vi.fn(async () => ({})),
        getRepositoryState: vi.fn(() => ({
          fonts: { items: { font: { name: "Font One", fileId: "font-one" } } },
          images: {
            items: {
              one: { name: "Image One", fileId: "image-one" },
              two: { name: "Image Two", fileId: "image-two" },
            },
          },
        })),
        getFileContent: vi.fn(async () => {
          throw error;
        }),
      },
      appService: { showAlert: vi.fn() },
      graphicsService: {
        init: vi.fn(async () => {}),
        initRouteEngine: vi.fn(),
        loadAssets: vi.fn(),
      },
      store: {
        setProjectResolution: vi.fn(),
        setAssetLoading: vi.fn(),
        setLoadingProgress: vi.fn(),
        selectIsPreviewLoading: vi.fn(() => false),
        setLoadingDetailsVisible: vi.fn(),
        selectLoadingDescription: vi.fn(() => "Opening project..."),
        setPreviewReady: vi.fn(),
        resetAssetLoadCache: vi.fn(),
        selectHasLoadedAssetFileId: vi.fn(() => false),
      },
      props: {},
      refs: { canvas: {} },
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    await handleAfterMount(deps);
    expect(deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
      "Fonts: Font One",
    );
    expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
      "replace",
    );
    expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
      "Preview cannot be played",
    );
    expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
      "• Fonts: Font One\n• Images: Image One\n• Images: Image Two",
    );
    expect(deps.projectService.getFileContent).toHaveBeenCalledTimes(3);
    expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
    expect(deps.graphicsService.initRouteEngine).not.toHaveBeenCalled();
    expect(deps.graphicsService.loadAssets).not.toHaveBeenCalled();
    expect(deps.store.setAssetLoading).toHaveBeenLastCalledWith({
      isLoading: false,
    });
  });

  it.each(["file", "graphics", "layout"])(
    "names a failed %s asset in fullscreen preview",
    async (phase) => {
      const { handleAfterMount } = await import(
        "../../src/components/vnPreview/vnPreview.handlers.js"
      );
      const { extractFileIdsForScenes, extractFileIdsForLayouts } =
        await import("../../src/internal/project/layout.js");
      const references = [{ url: "image-file", type: "image/png" }];
      const extract =
        phase === "layout" ? extractFileIdsForLayouts : extractFileIdsForScenes;
      vi.mocked(extract).mockReturnValueOnce(references);
      extractInitialHybridSceneIdsMock.mockReturnValue(["scene-one"]);
      constructProjectDataMock.mockReturnValue({
        screen: { width: 1280, height: 720 },
        story: { scenes: { "scene-one": {} } },
        resources: {
          images: { image: { fileId: "image-file" } },
          layouts: { dialogue: {} },
        },
      });
      const deps = {
        projectService: {
          ensureRepository: vi.fn(async () => ({})),
          getRepositoryState: vi.fn(() => ({
            images: {
              items: { image: { name: "Image One", fileId: "image-file" } },
            },
          })),
          getFileContent: vi.fn(async () => {
            if (phase === "file") throw new Error("File not found");
            return { url: "asset://image-file", type: "image/png" };
          }),
        },
        appService: { showAlert: vi.fn(), showToast: vi.fn() },
        graphicsService: {
          init: vi.fn(async () => {}),
          initRouteEngine: vi.fn(),
          loadAssets: vi.fn(async () => {
            throw Object.assign(new Error("Invalid image"), {
              details: { assetKey: "image-file" },
            });
          }),
        },
        store: {
          setProjectResolution: vi.fn(),
          setAssetLoading: vi.fn(),
          setLoadingProgress: vi.fn(),
          selectIsPreviewLoading: vi.fn(() => false),
          setLoadingDetailsVisible: vi.fn(),
          selectLoadingDescription: vi.fn(() => "Opening project..."),
          setPreviewReady: vi.fn(),
          resetAssetLoadCache: vi.fn(),
          selectHasLoadedAssetFileId: vi.fn(() => false),
          selectHasLoadedAssetSceneId: vi.fn(() => false),
          markAssetSceneIdsLoaded: vi.fn(),
        },
        props: {},
        refs: { canvas: {} },
        render: vi.fn(),
        dispatchEvent: vi.fn(),
      };
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await handleAfterMount(deps);
        expect(deps.appService.showAlert).toHaveBeenCalledOnce();
        expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
          "Images: Image One",
        );
        expect(deps.appService.showToast).not.toHaveBeenCalled();
        expect(deps.graphicsService.initRouteEngine).not.toHaveBeenCalled();
        expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
      } finally {
        log.mockRestore();
      }
    },
  );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    constructProjectDataMock.mockReset();
    extractInitialHybridSceneIdsMock.mockReset();
    extractTransitionTargetSceneIdsMock.mockReset();
    collectPreviewMissingTargetsMock.mockReset();
    withPreviewEntryPointMock.mockClear();
    ensurePreviewProjectDataTargetsMock.mockClear();
    resolveSceneIdForSectionIdMock.mockReset();

    constructProjectDataMock.mockReturnValue({
      screen: {
        width: 1280,
        height: 720,
      },
      story: {
        scenes: {},
      },
    });
    extractInitialHybridSceneIdsMock.mockReturnValue([]);
    extractTransitionTargetSceneIdsMock.mockReturnValue([]);
    collectPreviewMissingTargetsMock.mockReturnValue({
      missingSceneIds: [],
      missingSectionIds: [],
    });
    resolveSceneIdForSectionIdMock.mockReturnValue(undefined);
  });

  it.each([
    new Error("Preview initialization failed"),
    Object.assign(
      new Error("Initialize graphics timed out after 30 seconds."),
      { name: "TimeoutError" },
    ),
    "Native graphics failure",
    {},
  ])(
    "keeps startup failure visible until explicitly closed: %s",
    async (failure) => {
      const { handleAfterMount, handleClosePreview } = await import(
        "../../src/components/vnPreview/vnPreview.handlers.js"
      );
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const deps = {
        projectService: {
          ensureRepository: vi.fn().mockRejectedValue(failure),
        },
        refs: { previewSurface: { focus: vi.fn() } },
        appService: { showToast: vi.fn() },
        store: {
          setPreviewFailure: vi.fn(),
          setAssetLoading: vi.fn(),
          setLoadingProgress: vi.fn(),
          selectIsPreviewLoading: vi.fn(() => false),
          setLoadingDetailsVisible: vi.fn(),
          selectLoadingDescription: vi.fn(() => "Opening project..."),
          setPreviewReady: vi.fn(),
        },
        render: vi.fn(),
        dispatchEvent: vi.fn(),
        i18n: {
          resourcePages: {},
          scenesPage: {},
          sceneEditorPage: { failedOpenPreview: "Failed to open preview" },
        },
      };
      try {
        await handleAfterMount(deps);
        expect(deps.appService.showToast).not.toHaveBeenCalled();
        expect(deps.store.setPreviewFailure).toHaveBeenCalledWith({
          message: typeof failure === "string" ? failure : failure?.message,
        });
        expect(deps.dispatchEvent).not.toHaveBeenCalled();
        handleClosePreview(deps, {
          _event: { preventDefault() {}, stopPropagation() {} },
        });
        expect(deps.dispatchEvent.mock.calls[0][0].type).toBe("close");
      } finally {
        log.mockRestore();
      }
    },
  );

  it("clears the scene editor mute override when mounting full-screen preview", async () => {
    const { handleAfterMount } = await import(
      "../../src/components/vnPreview/vnPreview.handlers.js"
    );

    const deps = {
      projectService: {
        ensureRepository: vi.fn(async () => ({})),
        getRepositoryState: vi.fn(() => ({})),
      },
      graphicsService: {
        setEngineAudioMuted: vi.fn(),
        init: vi.fn(async () => {}),
        initRouteEngine: vi.fn(async () => {}),
        loadAssets: vi.fn(async () => {}),
        engineHandleActions: vi.fn(),
      },
      refs: {
        canvas: {},
        previewSurface: {
          focus: vi.fn(),
        },
      },
      props: {},
      store: {
        setProjectResolution: vi.fn(),
        setAssetLoading: vi.fn(),
        setLoadingProgress: vi.fn(),
        selectIsPreviewLoading: vi.fn(() => false),
        setLoadingDetailsVisible: vi.fn(),
        selectLoadingDescription: vi.fn(() => "Opening project..."),
        setPreviewReady: vi.fn(),
        resetAssetLoadCache: vi.fn(),
        selectHasLoadedAssetFileId: vi.fn(() => false),
        selectHasLoadedAssetSceneId: vi.fn(() => false),
        markAssetFileIdsLoaded: vi.fn(),
        markAssetSceneIdsLoaded: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleAfterMount(deps);

    expect(deps.graphicsService.setEngineAudioMuted).toHaveBeenCalledWith(
      false,
    );
    expect(deps.refs.previewSurface.focus).toHaveBeenCalledWith({
      preventScroll: true,
    });
  });

  it("prefetches direct transition targets after preview renders a different scene", async () => {
    const { handleAfterMount } = await import(
      "../../src/components/vnPreview/vnPreview.handlers.js"
    );

    const repository = {
      getContextState: vi.fn(async () => ({})),
    };
    const initRouteEngine = vi.fn(async (_projectData, options) => {
      await options.onRenderState?.({
        systemState: {
          contexts: [
            {
              currentPointerMode: "read",
              pointers: {
                read: {
                  sectionId: "scene-2-section-1",
                },
              },
            },
          ],
        },
      });
    });
    extractTransitionTargetSceneIdsMock.mockImplementation(
      (_projectData, sceneId) => {
        if (sceneId === "scene-2") {
          return ["scene-3"];
        }
        return [];
      },
    );
    resolveSceneIdForSectionIdMock.mockImplementation(
      (_projectData, sectionId) => {
        if (sectionId === "scene-2-section-1") {
          return "scene-2";
        }
        return undefined;
      },
    );
    collectPreviewMissingTargetsMock.mockImplementation(
      ({ sceneIds = [] }) => ({
        missingSceneIds: sceneIds,
        missingSectionIds: [],
      }),
    );

    const deps = {
      projectService: {
        ensureRepository: vi.fn(async () => repository),
        getRepositoryState: vi.fn(() => ({})),
      },
      graphicsService: {
        setEngineAudioMuted: vi.fn(),
        init: vi.fn(async () => {}),
        initRouteEngine,
        loadAssets: vi.fn(async () => {}),
        engineHandleActions: vi.fn(),
      },
      refs: {
        canvas: {},
      },
      props: {
        sceneId: "scene-1",
      },
      store: {
        setProjectResolution: vi.fn(),
        setAssetLoading: vi.fn(),
        setLoadingProgress: vi.fn(),
        selectIsPreviewLoading: vi.fn(() => false),
        setLoadingDetailsVisible: vi.fn(),
        selectLoadingDescription: vi.fn(() => "Opening project..."),
        setPreviewReady: vi.fn(),
        resetAssetLoadCache: vi.fn(),
        selectHasLoadedAssetFileId: vi.fn(() => false),
        selectHasLoadedAssetSceneId: vi.fn(() => false),
        markAssetFileIdsLoaded: vi.fn(),
        markAssetSceneIdsLoaded: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleAfterMount(deps);

    expect(ensurePreviewProjectDataTargetsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneIds: ["scene-3"],
      }),
    );
  });

  it("forwards preview Enter from outside the preview and closes only on Escape", async () => {
    const { handleBeforeMount } = await import(
      "../../src/components/vnPreview/vnPreview.handlers.js"
    );

    const listeners = {};
    const removeEventListener = vi.fn();
    const addEventListener = vi.fn((eventName, listener, _options) => {
      listeners[eventName] = listener;
    });
    vi.stubGlobal("window", {
      addEventListener,
      removeEventListener,
    });
    vi.stubGlobal(
      "CustomEvent",
      class CustomEvent {
        constructor(type) {
          this.type = type;
        }
      },
    );
    vi.stubGlobal(
      "Event",
      class Event {
        constructor(type, init = {}) {
          this.type = type;
          Object.assign(this, init);
        }
      },
    );
    vi.stubGlobal(
      "KeyboardEvent",
      class KeyboardEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.altKey = init.altKey;
          this.bubbles = init.bubbles;
          this.cancelable = init.cancelable;
          this.code = init.code;
          this.composed = init.composed;
          this.ctrlKey = init.ctrlKey;
          this.key = init.key;
          this.metaKey = init.metaKey;
          this.repeat = init.repeat;
          this.shiftKey = init.shiftKey;
          Object.defineProperties(this, {
            charCode: {
              value: 0,
            },
            keyCode: {
              value: 0,
            },
            which: {
              value: 0,
            },
          });
        }
      },
    );

    const editorTarget = {
      name: "editor",
    };
    const previewChild = {
      name: "preview",
    };
    const previewSurface = {
      contains: vi.fn((target) => target === previewChild),
      dispatchEvent: vi.fn(),
      focus: vi.fn(),
    };

    const deps = {
      dispatchEvent: vi.fn(),
      refs: {
        previewSurface,
      },
      graphicsService: {
        destroy: vi.fn(),
        getCanvas: vi.fn(),
      },
      store: {
        selectIsPreviewRotated: vi.fn(() => false),
        setUiConfig: vi.fn(),
        setAssetLoading: vi.fn(),
        setLoadingProgress: vi.fn(),
        selectIsPreviewLoading: vi.fn(() => false),
        setLoadingDetailsVisible: vi.fn(),
        selectLoadingDescription: vi.fn(() => "Opening project..."),
        setPreviewReady: vi.fn(),
        resetAssetLoadCache: vi.fn(),
      },
      uiConfig: {
        inputMode: "touch",
      },
    };

    const cleanup = handleBeforeMount(deps);

    expect(deps.store.setUiConfig).toHaveBeenCalledWith({
      uiConfig: deps.uiConfig,
    });

    const enterEvent = {
      type: "keydown",
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      target: editorTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners.keydown(enterEvent);

    expect(enterEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(enterEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(enterEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(previewSurface.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(previewSurface.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "keydown",
        key: "Enter",
        code: "Enter",
        charCode: 13,
        keyCode: 13,
        which: 13,
      }),
    );
    expect(deps.dispatchEvent).not.toHaveBeenCalled();

    const previewEnterEvent = {
      type: "keydown",
      key: "Enter",
      target: previewChild,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners.keydown(previewEnterEvent);

    expect(previewEnterEvent.preventDefault).not.toHaveBeenCalled();
    expect(previewEnterEvent.stopPropagation).not.toHaveBeenCalled();
    expect(previewEnterEvent.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(previewSurface.dispatchEvent).toHaveBeenCalledTimes(1);

    const enterKeyUpEvent = {
      type: "keyup",
      key: "Enter",
      code: "Enter",
      charCode: 13,
      keyCode: 13,
      which: 13,
      target: editorTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners.keyup(enterKeyUpEvent);

    expect(enterKeyUpEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(enterKeyUpEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(enterKeyUpEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(previewSurface.dispatchEvent).toHaveBeenCalledTimes(2);
    expect(previewSurface.dispatchEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "keyup",
        key: "Enter",
        charCode: 13,
        keyCode: 13,
        which: 13,
      }),
    );

    const escapeEvent = {
      key: "Escape",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners.keydown(escapeEvent);

    expect(escapeEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(escapeEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(escapeEvent.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(deps.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "close",
      }),
    );

    cleanup();

    expect(addEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      true,
    );
    expect(addEventListener).toHaveBeenCalledWith(
      "keyup",
      expect.any(Function),
      true,
    );
    expect(deps.graphicsService.destroy).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
      true,
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      "keyup",
      expect.any(Function),
      true,
    );
    [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointerover",
      "pointerout",
      "pointerleave",
      "pointercancel",
      "wheel",
    ].forEach((eventType) => {
      expect(addEventListener).toHaveBeenCalledWith(
        eventType,
        expect.any(Function),
        true,
      );
      expect(removeEventListener).toHaveBeenCalledWith(
        eventType,
        expect.any(Function),
        true,
      );
    });
    expect(addEventListener).toHaveBeenCalledTimes(10);
    expect(removeEventListener).toHaveBeenCalledTimes(10);
  });

  it("maps rotated pointer events back to the scene coordinate axes", async () => {
    const { handleBeforeMount } = await import(
      "../../src/components/vnPreview/vnPreview.handlers.js"
    );
    const listeners = {};
    vi.stubGlobal("window", {
      addEventListener: vi.fn((eventName, listener) => {
        listeners[eventName] = listener;
      }),
      removeEventListener: vi.fn(),
    });

    const deps = {
      dispatchEvent: vi.fn(),
      refs: {},
      graphicsService: {
        destroy: vi.fn(),
        getCanvas: vi.fn(() => ({
          getBoundingClientRect: () => ({
            left: 100,
            top: 50,
            width: 360,
            height: 640,
          }),
        })),
      },
      store: {
        selectIsPreviewRotated: vi.fn(() => true),
        setUiConfig: vi.fn(),
        setAssetLoading: vi.fn(),
        setLoadingProgress: vi.fn(),
        selectIsPreviewLoading: vi.fn(() => false),
        setLoadingDetailsVisible: vi.fn(),
        selectLoadingDescription: vi.fn(() => "Opening project..."),
        setPreviewReady: vi.fn(),
        resetAssetLoadCache: vi.fn(),
      },
      uiConfig: {
        inputMode: "touch",
      },
    };
    const cleanup = handleBeforeMount(deps);
    const event = {
      clientX: 460,
      clientY: 50,
    };

    listeners.pointerdown(event);

    expect(event).toMatchObject({
      clientX: 100,
      clientY: 50,
    });
    expect(deps.graphicsService.getCanvas).toHaveBeenCalledOnce();

    const wheelEvent = {
      clientX: 460,
      clientY: 50,
      deltaY: 120,
    };

    listeners.wheel(wheelEvent);

    expect(wheelEvent).toMatchObject({
      clientX: 100,
      clientY: 50,
      deltaY: 120,
    });
    expect(deps.graphicsService.getCanvas).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it("toggles rotation without forwarding the control click to the preview", async () => {
    const { handleRotatePreview } = await import(
      "../../src/components/vnPreview/vnPreview.handlers.js"
    );
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    const deps = {
      refs: {
        previewSurface: {
          focus: vi.fn(),
        },
      },
      render: vi.fn(),
      store: {
        togglePreviewRotation: vi.fn(),
      },
    };

    handleRotatePreview(deps, { _event: event });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(deps.store.togglePreviewRotation).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.refs.previewSurface.focus).toHaveBeenCalledWith({
      preventScroll: true,
    });
  });
});
