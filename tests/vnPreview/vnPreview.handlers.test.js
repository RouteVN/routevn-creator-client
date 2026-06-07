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
      },
      store: {
        setAssetLoading: vi.fn(),
        setPreviewReady: vi.fn(),
        resetAssetLoadCache: vi.fn(),
      },
    };

    const cleanup = handleBeforeMount(deps);

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
    expect(addEventListener).toHaveBeenCalledTimes(2);
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });
});
