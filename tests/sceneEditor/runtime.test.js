import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "route-engine-js";
import {
  createSceneEditorRenderQueue,
  renderSceneEditorCanvas,
  renderSceneEditorState,
  updateSceneEditorSectionChanges,
} from "../../src/internal/ui/sceneEditor/runtime.js";

const createProjectData = () => {
  return {
    screen: {
      width: 1920,
      height: 1080,
      backgroundColor: "#000000",
    },
    resources: {
      images: {},
      videos: {},
      sounds: {},
      fonts: {},
      colors: {},
      textStyles: {},
      controls: {},
      transforms: {},
      characters: {},
      animations: {},
      variables: {},
      layouts: {
        adv: {
          id: "adv",
          name: "ADV Layout",
          layoutType: "dialogue",
          isFragment: false,
          elements: [
            {
              id: "adv-root",
              type: "text",
              content: "${dialogue.content[0].text}",
            },
          ],
        },
        nvl: {
          id: "nvl",
          name: "NVL Layout",
          layoutType: "nvl",
          isFragment: false,
          elements: [
            {
              id: "nvl-root",
              type: "container",
              children: [
                {
                  id: "nvl-item-${i}",
                  type: "text",
                  $each: "line, i in dialogue.lines",
                  content: "${line.content[0].text}",
                },
              ],
            },
          ],
        },
      },
    },
    story: {
      initialSceneId: "scene-1",
      scenes: {
        "scene-1": {
          name: "Scene 1",
          initialSectionId: "section-1",
          sections: {
            "section-1": {
              name: "Section 1",
              initialLineId: "line-1",
              lines: [
                {
                  id: "line-1",
                  actions: {
                    dialogue: {
                      mode: "adv",
                      ui: {
                        resourceId: "adv",
                      },
                      content: [{ text: "first" }],
                    },
                  },
                },
                {
                  id: "line-2",
                  actions: {
                    dialogue: {
                      content: [{ text: "second" }],
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
  };
};

const createGraphicsService = () => {
  let engine;
  const setEngineAudioMuted = vi.fn();

  return {
    initRouteEngine: (projectData) => {
      engine = createRouteEngine({
        handlePendingEffects() {},
      });
      engine.init({
        initialState: {
          global: {},
          projectData,
        },
      });
    },
    engineSelectRenderState: () => engine?.selectRenderState(),
    ensureAudioAssetsLoaded: async () => {},
    engineRenderCurrentState: () => {},
    engineHandleActions: (actions, eventContext, options) => {
      engine?.handleActions(actions, eventContext, options);
    },
    engineSelectPresentationState: () => engine?.selectPresentationState(),
    engineSelectSectionLineChanges: (options) =>
      engine?.selectSectionLineChanges(options),
    setEngineAudioMuted,
  };
};

describe("renderSceneEditorState", () => {
  it("requests per-line presentationState from section line changes", async () => {
    const changes = { lines: [] };
    const engineSelectSectionLineChanges = vi.fn(() => changes);
    const setSectionLineChanges = vi.fn();

    await updateSceneEditorSectionChanges({
      store: {
        selectSelectedSectionId: () => "section-1",
        setSectionLineChanges,
      },
      graphicsService: {
        engineSelectSectionLineChanges,
      },
    });

    expect(engineSelectSectionLineChanges).toHaveBeenCalledWith({
      sectionId: "section-1",
      includePresentationState: true,
    });
    expect(setSectionLineChanges).toHaveBeenCalledWith({
      changes,
    });
  });

  it("coalesces overlapping canvas renders to the latest pending payload", async () => {
    const resolvers = [];
    const renderCanvas = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const queueRenderCanvas = createSceneEditorRenderQueue(renderCanvas);

    void queueRenderCanvas({ step: 1 });
    void queueRenderCanvas({ step: 2 });
    void queueRenderCanvas({ step: 3 });

    expect(renderCanvas).toHaveBeenCalledTimes(1);
    expect(renderCanvas).toHaveBeenNthCalledWith(1, { step: 1 });

    resolvers.shift()?.();
    await Promise.resolve();

    expect(renderCanvas).toHaveBeenCalledTimes(2);
    expect(renderCanvas).toHaveBeenNthCalledWith(2, { step: 3 });

    resolvers.shift()?.();
    await Promise.resolve();

    expect(renderCanvas).toHaveBeenCalledTimes(2);
  });

  it("skips inline canvas renders while full-screen preview is visible", async () => {
    const render = vi.fn();
    const store = {
      selectIsScenePageLoading: () => false,
      selectPreviewScene: () => ({
        previewVisible: true,
        previewSceneId: "scene-1",
      }),
      selectSceneId: vi.fn(),
      selectSelectedSectionId: vi.fn(),
      selectSelectedLineId: vi.fn(),
      selectProjectData: vi.fn(),
    };

    await renderSceneEditorCanvas(
      {
        store,
        render,
        refs: {},
      },
      {},
    );

    expect(render).not.toHaveBeenCalled();
    expect(store.selectSceneId).not.toHaveBeenCalled();
    expect(store.selectProjectData).not.toHaveBeenCalled();
  });

  it("re-initializes the engine for selected-line preview updates", async () => {
    const projectData = createProjectData();
    const graphicsService = createGraphicsService();
    const store = {
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectPreviewRuntimeGlobal: () => ({
        dialogueTextSpeed: 100,
      }),
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      presentationState: undefined,
    };

    graphicsService.initRouteEngine(projectData, {
      enableGlobalKeyboardBindings: false,
    });

    await expect(
      renderSceneEditorState({
        store,
        graphicsService,
      }),
    ).resolves.toBeUndefined();

    await expect(
      renderSceneEditorState({
        store,
        graphicsService,
      }),
    ).resolves.toBeUndefined();

    expect(store.presentationState?.dialogue?.ui?.resourceId).toBe("adv");
    expect(store.presentationState?.dialogue?.content?.[0]?.text).toBe(
      "second",
    );
  });

  it("applies temporary presentation state to the engine without replacing base store state", async () => {
    const projectData = createProjectData();
    const graphicsService = createGraphicsService();
    const temporaryPresentationState = {
      dialogue: {
        mode: "adv",
        ui: {
          resourceId: "adv",
        },
        content: [{ text: "temporary" }],
      },
    };
    const store = {
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectTemporaryPresentationState: () => temporaryPresentationState,
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      presentationState: undefined,
    };

    await renderSceneEditorState({
      store,
      graphicsService,
    });

    expect(store.presentationState?.dialogue?.content?.[0]?.text).toBe(
      "second",
    );
    expect(
      graphicsService.engineSelectPresentationState()?.dialogue?.content?.[0]
        ?.text,
    ).toBe("temporary");
  });

  it("can warm route-engine state without drawing the canvas", async () => {
    const projectData = createProjectData();
    const graphicsService = createGraphicsService();
    const engineRenderCurrentState = vi.fn();
    graphicsService.engineRenderCurrentState = engineRenderCurrentState;

    const store = {
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectPreviewRuntimeGlobal: () => ({
        dialogueTextSpeed: 100,
      }),
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      presentationState: undefined,
    };

    graphicsService.initRouteEngine(projectData, {
      enableGlobalKeyboardBindings: false,
    });

    await renderSceneEditorState(
      {
        store,
        graphicsService,
      },
      {
        skipCanvasPaint: true,
      },
    );
    expect(engineRenderCurrentState).not.toHaveBeenCalled();
    expect(store.presentationState?.dialogue?.content?.[0]?.text).toBe(
      "second",
    );

    await renderSceneEditorState({
      store,
      graphicsService,
    });

    expect(engineRenderCurrentState).toHaveBeenCalledTimes(1);
  });

  it("renders the UI after a skipped canvas render when presentation state changes", async () => {
    const projectData = createProjectData();
    const graphicsService = createGraphicsService();
    const render = vi.fn();
    const store = {
      selectIsScenePageLoading: () => false,
      selectPreviewScene: () => ({
        previewVisible: false,
      }),
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectPreviewRuntimeGlobal: () => ({
        dialogueTextSpeed: 100,
      }),
      selectTemporaryPresentationState: () => ({}),
      selectEffectivePresentationState: () => store.presentationState ?? {},
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      setSectionLineChanges: ({ changes }) => {
        store.sectionLineChanges = changes;
      },
      presentationState: {
        dialogue: {
          ui: {
            resourceId: "stale",
          },
        },
      },
    };

    await renderSceneEditorCanvas(
      {
        store,
        render,
        graphicsService,
        refs: {
          canvas: {
            isConnected: true,
          },
        },
      },
      {
        skipRender: true,
        syncPresentationState: true,
        skipAnimations: true,
      },
    );

    expect(render).toHaveBeenCalledTimes(1);
    expect(store.presentationState?.dialogue?.ui?.resourceId).toBe("adv");
    expect(store.presentationState?.dialogue?.content?.[0]?.text).toBe(
      "second",
    );
  });

  it("syncs the graphics engine audio mute state from scene editor settings", async () => {
    const projectData = createProjectData();
    const graphicsService = createGraphicsService();
    const store = {
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectPreviewRuntimeGlobal: () => ({
        dialogueTextSpeed: 100,
      }),
      selectIsMuted: () => true,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      presentationState: undefined,
    };

    graphicsService.initRouteEngine(projectData, {
      enableGlobalKeyboardBindings: false,
    });

    await renderSceneEditorState({
      store,
      graphicsService,
    });

    expect(graphicsService.setEngineAudioMuted).toHaveBeenCalledWith(true);
  });
});
