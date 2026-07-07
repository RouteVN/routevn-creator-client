import { describe, expect, it, vi } from "vitest";
import createRouteEngine from "route-engine-js";
import {
  createSceneEditorRenderQueue,
  renderSceneEditorCanvas,
  renderSceneEditorState,
  resolveSceneEditorEntrySelection,
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
  it("resolves scene entry from the target section and ignores stale line payload", () => {
    const scene = {
      initialSectionId: "section-2",
      sections: [
        {
          id: "section-1",
          lines: [{ id: "line-1" }, { id: "line-stale" }],
        },
        {
          id: "section-2",
          lines: [{ id: "line-2a" }, { id: "line-2b" }],
        },
      ],
    };

    expect(
      resolveSceneEditorEntrySelection(scene, {
        sectionId: "section-1",
        lineId: "line-stale",
      }),
    ).toEqual({
      sectionId: "section-1",
      lineId: "line-1",
    });
  });

  it("resolves scene entry from initial section or falls back to first section", () => {
    expect(
      resolveSceneEditorEntrySelection({
        initialSectionId: "section-2",
        sections: [
          {
            id: "section-1",
            lines: [{ id: "line-1" }],
          },
          {
            id: "section-2",
            lines: [{ id: "line-2" }],
          },
        ],
      }),
    ).toEqual({
      sectionId: "section-2",
      lineId: "line-2",
    });

    expect(
      resolveSceneEditorEntrySelection({
        initialSectionId: "missing-section",
        sections: [
          {
            id: "section-1",
            lines: [{ id: "line-1" }],
          },
        ],
      }),
    ).toEqual({
      sectionId: "section-1",
      lineId: "line-1",
    });
  });

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

  it("requests per-line changes for every visible section", async () => {
    const changesBySectionId = {
      "section-1": { lines: [{ id: "line-1" }] },
      "section-2": { lines: [{ id: "line-2" }] },
    };
    const engineSelectSectionLineChanges = vi.fn(
      ({ sectionId }) => changesBySectionId[sectionId],
    );
    const setSectionLineChangesBySectionId = vi.fn();

    await updateSceneEditorSectionChanges({
      store: {
        selectSelectedSectionId: () => "section-1",
        selectScene: () => ({
          sections: [{ id: "section-1" }, { id: "section-2" }],
        }),
        setSectionLineChangesBySectionId,
      },
      graphicsService: {
        engineSelectSectionLineChanges,
      },
    });

    expect(engineSelectSectionLineChanges).toHaveBeenCalledTimes(2);
    expect(engineSelectSectionLineChanges).toHaveBeenNthCalledWith(1, {
      sectionId: "section-1",
      includePresentationState: true,
    });
    expect(engineSelectSectionLineChanges).toHaveBeenNthCalledWith(2, {
      sectionId: "section-2",
      includePresentationState: true,
    });
    expect(setSectionLineChangesBySectionId).toHaveBeenCalledWith({
      changesBySectionId,
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

  it("warms render-state videos before painting the canvas", async () => {
    const projectData = createProjectData();
    const graphicsService = createGraphicsService();
    const renderState = {
      id: "render-with-video",
      elements: [
        {
          id: "intro-video",
          type: "video",
          src: "blob:http://localhost/intro-video.mp4",
        },
      ],
      audio: [],
      animations: [],
    };
    const warmRenderStateVideoAssets = vi.fn(async () => {});
    const engineRenderCurrentState = vi.fn();
    graphicsService.engineSelectRenderState = vi.fn(() => renderState);
    graphicsService.warmRenderStateVideoAssets = warmRenderStateVideoAssets;
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

    await renderSceneEditorState({
      store,
      graphicsService,
    });

    expect(warmRenderStateVideoAssets).toHaveBeenCalledWith(renderState);
    expect(warmRenderStateVideoAssets.mock.invocationCallOrder[0]).toBeLessThan(
      engineRenderCurrentState.mock.invocationCallOrder[0],
    );
  });

  it("skips preview animations by default unless explicitly enabled", async () => {
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

    await renderSceneEditorState({
      store,
      graphicsService,
    });

    await renderSceneEditorState(
      {
        store,
        graphicsService,
      },
      {
        skipAnimations: false,
      },
    );

    expect(engineRenderCurrentState).toHaveBeenNthCalledWith(1, {
      preserveAnimationPlayback: false,
      skipAudio: false,
      skipAnimations: true,
    });
    expect(engineRenderCurrentState).toHaveBeenNthCalledWith(2, {
      preserveAnimationPlayback: false,
      skipAudio: false,
      skipAnimations: false,
    });
  });

  it("can skip render-state animations while preserving playback", async () => {
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

    await renderSceneEditorState(
      {
        store,
        graphicsService,
      },
      {
        preserveAnimationPlayback: true,
        skipAnimations: true,
      },
    );

    expect(engineRenderCurrentState).toHaveBeenCalledWith({
      preserveAnimationPlayback: true,
      skipAudio: false,
      skipAnimations: true,
    });
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
          previewCanvasHost: {
            getCanvasRoot: () => ({
              isConnected: true,
            }),
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

  it("paints the main preview canvas after the background transform editor closes", async () => {
    const projectData = createProjectData();
    projectData.resources.images["bg-school"] = {
      id: "bg-school",
      fileId: "bg-school.png",
      width: 3840,
      height: 2160,
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[1].actions.background = {
      resourceId: "bg-school",
      x: 2051,
      y: 1300,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      originX: 0,
      originY: 0,
    };
    const graphicsService = createGraphicsService();
    graphicsService.attachCanvas = vi.fn(async () => {});
    graphicsService.loadAssets = vi.fn(async () => {});
    const mainCanvasRoot = {
      isConnected: true,
      id: "main-preview",
    };
    const transformEditorCanvasRoot = {
      isConnected: true,
      id: "transform-editor-preview",
    };
    const store = {
      selectIsScenePageLoading: () => false,
      selectPreviewScene: () => ({
        previewVisible: false,
      }),
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectTemporaryPresentationState: () => ({}),
      selectIsBackgroundTransformEditorOpen: () => false,
      selectScene: () => ({
        sections: [{ id: "section-1" }],
      }),
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      setSectionLineChanges: vi.fn(),
    };

    await renderSceneEditorCanvas(
      {
        store,
        render: vi.fn(),
        graphicsService,
        projectService: {
          getFileContent: vi.fn(async (fileId) => ({
            url: fileId,
          })),
        },
        refs: {
          previewCanvasHost: {
            getCanvasRoot: () => mainCanvasRoot,
          },
          systemActions: {
            transformedHandlers: {
              handleGetBackgroundTransformPreviewCanvasRoot: () =>
                transformEditorCanvasRoot,
            },
          },
        },
      },
      {
        skipRender: true,
        skipAnimations: true,
      },
    );

    expect(graphicsService.attachCanvas).toHaveBeenCalledWith(mainCanvasRoot);
    expect(graphicsService.attachCanvas).not.toHaveBeenCalledWith(
      transformEditorCanvasRoot,
    );
  });

  it("backs off failed scene video asset loads after the first attempt", async () => {
    const projectData = createProjectData();
    projectData.resources.videos["intro-video"] = {
      id: "intro-video",
      fileId: "intro-video.mp4",
      fileType: "video/mp4",
      width: 1920,
      height: 1080,
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[1].actions.background = {
      resourceId: "intro-video",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };
    const graphicsService = createGraphicsService();
    graphicsService.loadAssets = vi.fn(async (assets) => {
      if (assets["intro-video.mp4"]) {
        throw new Error('Timed out loading video asset "intro-video.mp4".');
      }
    });
    const projectService = {
      getFileContent: vi.fn(async (fileId) => ({
        url: `asset://${fileId}`,
      })),
    };
    const store = {
      selectIsScenePageLoading: () => false,
      selectPreviewScene: () => ({
        previewVisible: false,
      }),
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectTemporaryPresentationState: () => ({}),
      selectIsBackgroundTransformEditorOpen: () => false,
      selectScene: () => ({
        sections: [{ id: "section-1" }],
      }),
      selectIsMuted: () => true,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      setSectionLineChanges: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      graphicsService,
      projectService,
      refs: {
        previewCanvasHost: {
          getCanvasRoot: () => ({
            isConnected: true,
          }),
        },
      },
    };

    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });
    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });

    expect(graphicsService.loadAssets).toHaveBeenCalledTimes(1);
    expect(projectService.getFileContent).toHaveBeenCalledTimes(1);
  });

  it("uses project file metadata for scene videos when resource fileType is missing", async () => {
    const projectData = createProjectData();
    projectData.resources.videos["intro-video"] = {
      id: "intro-video",
      fileId: "metadata-video.mp4",
      width: 1920,
      height: 1080,
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[1].actions.background = {
      resourceId: "intro-video",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };
    const graphicsService = createGraphicsService();
    graphicsService.loadAssets = vi.fn(async () => {});
    const projectService = {
      getFileContent: vi.fn(async (fileId) => ({
        url: `http://127.0.0.1:45000/file.mp4?path=${fileId}`,
        type: "video/mp4",
      })),
    };
    const store = {
      selectIsScenePageLoading: () => false,
      selectPreviewScene: () => ({
        previewVisible: false,
      }),
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectTemporaryPresentationState: () => ({}),
      selectIsBackgroundTransformEditorOpen: () => false,
      selectScene: () => ({
        sections: [{ id: "section-1" }],
      }),
      selectIsMuted: () => true,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      setSectionLineChanges: vi.fn(),
    };

    await renderSceneEditorCanvas(
      {
        store,
        render: vi.fn(),
        graphicsService,
        projectService,
        refs: {
          previewCanvasHost: {
            getCanvasRoot: () => ({
              isConnected: true,
            }),
          },
        },
      },
      {
        skipRender: true,
        skipAnimations: true,
      },
    );

    expect(graphicsService.loadAssets).toHaveBeenCalledWith({
      "metadata-video.mp4": {
        url: "http://127.0.0.1:45000/file.mp4?path=metadata-video.mp4",
        type: "video/mp4",
      },
    });
  });

  it("keeps valid scene videos loaded when another video fails", async () => {
    const projectData = createProjectData();
    projectData.resources.videos["intro-video"] = {
      id: "intro-video",
      fileId: "bad-video.mp4",
      fileType: "video/mp4",
      width: 1920,
      height: 1080,
    };
    projectData.resources.videos["outro-video"] = {
      id: "outro-video",
      fileId: "good-video.mp4",
      fileType: "video/mp4",
      width: 1920,
      height: 1080,
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[0].actions.background = {
      resourceId: "outro-video",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[1].actions.background = {
      resourceId: "intro-video",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };
    const loadedAssetIds = new Set();
    const graphicsService = createGraphicsService();
    graphicsService.hasLoadedAsset = vi.fn((fileId) =>
      loadedAssetIds.has(fileId),
    );
    graphicsService.loadAssets = vi.fn(async (assets) => {
      if (assets["bad-video.mp4"]) {
        throw new Error('Timed out loading video asset "bad-video.mp4".');
      }

      Object.keys(assets).forEach((fileId) => {
        loadedAssetIds.add(fileId);
      });
    });
    const projectService = {
      getFileContent: vi.fn(async (fileId) => ({
        url: `asset://${fileId}`,
      })),
    };
    const store = {
      selectIsScenePageLoading: () => false,
      selectPreviewScene: () => ({
        previewVisible: false,
      }),
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectTemporaryPresentationState: () => ({}),
      selectIsBackgroundTransformEditorOpen: () => false,
      selectScene: () => ({
        sections: [{ id: "section-1" }],
      }),
      selectIsMuted: () => true,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      setSectionLineChanges: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      graphicsService,
      projectService,
      refs: {
        previewCanvasHost: {
          getCanvasRoot: () => ({
            isConnected: true,
          }),
        },
      },
    };

    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });
    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });

    const loadedAssetCallKeys = graphicsService.loadAssets.mock.calls.map(
      ([assets]) => Object.keys(assets),
    );
    expect(loadedAssetCallKeys).toEqual([
      ["good-video.mp4", "bad-video.mp4"],
      ["good-video.mp4"],
      ["bad-video.mp4"],
    ]);
    expect(loadedAssetIds.has("good-video.mp4")).toBe(true);
    expect(loadedAssetIds.has("bad-video.mp4")).toBe(false);
    expect(projectService.getFileContent).toHaveBeenCalledTimes(2);
  });

  it("does not reload scene audio after decoded audio is pruned", async () => {
    const projectData = createProjectData();
    projectData.resources.sounds["intro-bgm"] = {
      id: "intro-bgm",
      fileId: "intro-bgm.mp3",
      fileType: "audio/mpeg",
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[1].actions.bgm = {
      resourceId: "intro-bgm",
      loop: true,
      volume: 50,
    };
    const graphicsService = createGraphicsService();
    graphicsService.hasLoadedAsset = vi.fn(() => false);
    graphicsService.loadAssets = vi.fn(async () => {});
    const projectService = {
      getFileContent: vi.fn(async (fileId) => ({
        url: `asset://${fileId}`,
      })),
    };
    const store = {
      selectIsScenePageLoading: () => false,
      selectPreviewScene: () => ({
        previewVisible: false,
      }),
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectTemporaryPresentationState: () => ({}),
      selectIsBackgroundTransformEditorOpen: () => false,
      selectScene: () => ({
        sections: [{ id: "section-1" }],
      }),
      selectIsMuted: () => true,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      setSectionLineChanges: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      graphicsService,
      projectService,
      refs: {
        previewCanvasHost: {
          getCanvasRoot: () => ({
            isConnected: true,
          }),
        },
      },
    };

    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });
    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });

    expect(graphicsService.loadAssets).toHaveBeenCalledTimes(1);
    expect(projectService.getFileContent).toHaveBeenCalledTimes(1);
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
