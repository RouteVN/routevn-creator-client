import { describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import createRouteEngine, { createEffectsHandler } from "route-engine-js";
import {
  createSceneEditorRenderQueue,
  flushSceneEditorCanvasRender,
  initializeSceneEditorPage,
  mountSceneEditorSubscriptions,
  renderSceneEditorCanvas,
  renderSceneEditorState,
  resolveSceneEditorEntrySelection,
  restoreSceneEditorFromPreview,
  updateSceneEditorSectionChanges,
} from "../../src/internal/ui/sceneEditor/runtime.js";

import {
  clearBackgroundTransformEditorPreviewTransform,
  createInitialState,
  openBackgroundTransformEditor,
  selectBackgroundTransformEditor,
  selectCanvasBackgroundTransformEditor,
  selectIsBackgroundTransformEditorOpen,
  selectWarnedAssetFileIds,
  markAssetWarningsShown,
  setBackgroundTransformEditorPreviewTransform,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";

const createWarningStore = () => {
  const context = { state: { warnedAssetFileIds: [] } };
  return {
    selectWarnedAssetFileIds: () => selectWarnedAssetFileIds(context),
    markAssetWarningsShown: (payload) =>
      markAssetWarningsShown(context, payload),
  };
};

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
  it("still paints when the audio warm-up retries a damaged sound", async () => {
    const projectData = createProjectData();
    const graphicsService = createGraphicsService();
    const failure = Object.assign(new Error("Invalid audio bytes"), {
      fileId: "sound-one",
    });
    graphicsService.collectRenderStateAudioKeys = () => ["sound-one"];
    graphicsService.ensureAudioAssetsLoaded = vi
      .fn()
      .mockRejectedValue(failure);
    graphicsService.engineRenderCurrentState = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const showAlert = vi.fn();
    try {
      await renderSceneEditorState({
        graphicsService,
        appService: { showAlert },
        store: {
          selectSceneId: () => "scene-1",
          selectSelectedSectionId: () => "section-1",
          selectSelectedLineId: () => "line-1",
          selectProjectData: () => projectData,
          selectTemporaryPresentationState: () => ({}),
          selectIsMuted: () => false,
          setPresentationState: vi.fn(),
        },
      });
      expect(graphicsService.ensureAudioAssetsLoaded).toHaveBeenCalledWith([
        "sound-one",
      ]);
      expect(graphicsService.engineRenderCurrentState).toHaveBeenCalledOnce();
      expect(showAlert).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        "[sceneEditor] Failed to warm up audio assets",
        failure,
      );
    } finally {
      log.mockRestore();
    }
  });

  it.each(["dialogue", "background"])(
    "warns once for a damaged font in a %s layout and retries on the next render",
    async (usage) => {
      const projectData = createProjectData();
      projectData.resources.fonts["font-one"] = {
        id: "font-one",
        fileId: "font-file-one",
        fileType: "font/ttf",
        name: "Font One",
      };
      projectData.resources.colors["color-one"] = { hex: "#ffffff" };
      projectData.resources.textStyles["style-one"] = {
        fontId: ["font-one"],
        fontSize: 24,
        colorId: "color-one",
      };
      projectData.resources.layouts.adv.elements[0].textStyleId = "style-one";
      if (usage === "background") {
        projectData.resources.layouts["background-layout"] = {
          id: "background-layout",
          type: "layout",
          elements: [
            {
              id: "text-one",
              type: "text",
              content: "Text",
              textStyleId: "style-one",
            },
          ],
        };
        delete projectData.resources.layouts.adv.elements[0].textStyleId;
        projectData.story.scenes["scene-1"].sections[
          "section-1"
        ].lines[0].actions.background = {
          resourceId: "background-layout",
          resourceType: "layout",
        };
      }
      const graphicsService = createGraphicsService();
      graphicsService.loadAssets = vi.fn(async () => {});
      const projectService = {
        getFileContent: vi.fn(async () => {
          throw Object.assign(new Error("checksum mismatch"), {
            fileId: "font-file-one",
            code: "font_integrity_mismatch",
          });
        }),
      };
      const store = {
        ...createWarningStore(),
        selectIsScenePageLoading: () => false,
        selectPreviewScene: () => ({ previewVisible: false }),
        selectSceneId: () => "scene-1",
        selectSelectedSectionId: () => "section-1",
        selectSelectedLineId: () => "line-2",
        selectProjectData: () => projectData,
        selectTemporaryPresentationState: () => ({}),
        selectIsBackgroundTransformEditorOpen: () => false,
        selectScene: () => ({ sections: [{ id: "section-1" }] }),
        selectIsMuted: () => true,
        setPresentationState: vi.fn(),
        setSectionLineChanges: vi.fn(),
      };
      const deps = {
        store,
        projectService,
        graphicsService,
        render: vi.fn(),
        appService: { showAlert: vi.fn() },
        refs: {
          previewCanvasHost: { getCanvasRoot: () => ({ isConnected: true }) },
        },
      };
      const original = structuredClone(projectData);
      await renderSceneEditorCanvas(deps, {
        skipRender: true,
        skipAnimations: true,
      });
      const firstReadCount = projectService.getFileContent.mock.calls.length;
      const firstAlertCount = deps.appService.showAlert.mock.calls.length;
      await renderSceneEditorCanvas(deps, {
        skipRender: true,
        skipAnimations: true,
      });
      expect(projectService.getFileContent.mock.calls.length).toBeGreaterThan(
        firstReadCount,
      );
      expect(graphicsService.loadAssets).not.toHaveBeenCalled();
      expect(firstAlertCount).toBe(1);
      expect(deps.appService.showAlert).toHaveBeenCalledOnce();
      expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
        "Fonts: Font One",
      );
      expect(projectData).toEqual(original);

      projectData.resources.fonts["font-one"].fileId = "font-file-two";
      await renderSceneEditorCanvas(deps, {
        skipRender: true,
        skipAnimations: true,
      });
      expect(deps.appService.showAlert).toHaveBeenCalledTimes(2);

      // A newly mounted editor gets fresh local warning state.
      deps.store = { ...store, ...createWarningStore() };
      await renderSceneEditorCanvas(deps, {
        skipRender: true,
        skipAnimations: true,
      });
      expect(deps.appService.showAlert).toHaveBeenCalledTimes(3);
    },
  );

  it("resolves the configured target-section entry and ignores stale line payload", () => {
    const scene = {
      initialSectionId: "section-2",
      sections: [
        {
          id: "section-1",
          initialLineId: "line-entry",
          lines: [{ id: "line-1" }, { id: "line-entry" }, { id: "line-stale" }],
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
      lineId: "line-entry",
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
            initialLineId: "line-2b",
            lines: [{ id: "line-2a" }, { id: "line-2b" }],
          },
        ],
      }),
    ).toEqual({
      sectionId: "section-2",
      lineId: "line-2b",
    });

    expect(
      resolveSceneEditorEntrySelection({
        initialSectionId: "missing-section",
        sections: [
          {
            id: "section-1",
            initialLineId: "missing-line",
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

  it("waits for an active canvas render and its latest pending render", async () => {
    const resolvers = [];
    const renderCanvas = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const queueRenderCanvas = createSceneEditorRenderQueue(renderCanvas);
    const firstRender = queueRenderCanvas({ step: 1 });
    const pendingRender = queueRenderCanvas({ step: 2 });
    let pendingRenderCompleted = false;
    void pendingRender.then(() => {
      pendingRenderCompleted = true;
    });

    resolvers.shift()?.();
    await Promise.resolve();

    expect(renderCanvas).toHaveBeenNthCalledWith(2, { step: 2 });
    expect(pendingRenderCompleted).toBe(false);

    resolvers.shift()?.();
    await pendingRender;
    await firstRender;

    expect(pendingRenderCompleted).toBe(true);
  });

  it("supports a longer canvas debounce for typing without slowing other renders", async () => {
    vi.useFakeTimers();
    const subject = new Subject();
    const selectIsScenePageLoading = vi.fn(() => true);
    const unmount = mountSceneEditorSubscriptions({
      subject,
      store: {
        selectIsScenePageLoading,
      },
    });

    try {
      subject.next({
        action: "sceneEditor.renderCanvas",
        payload: { debounceMs: 100 },
      });

      await vi.advanceTimersByTimeAsync(99);
      expect(selectIsScenePageLoading).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(selectIsScenePageLoading).toHaveBeenCalledOnce();

      selectIsScenePageLoading.mockClear();
      subject.next({
        action: "sceneEditor.renderCanvas",
        payload: {},
      });

      await vi.advanceTimersByTimeAsync(49);
      expect(selectIsScenePageLoading).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(selectIsScenePageLoading).toHaveBeenCalledOnce();
    } finally {
      unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("flushes a pending debounced canvas render immediately", async () => {
    vi.useFakeTimers();
    const subject = new Subject();
    subject.dispatch = (action, payload) => {
      subject.next({ action, payload });
    };
    const selectIsScenePageLoading = vi.fn(() => true);
    const unmount = mountSceneEditorSubscriptions({
      subject,
      store: {
        selectIsScenePageLoading,
      },
    });

    try {
      subject.dispatch("sceneEditor.renderCanvas", {
        debounceMs: 100,
        skipRender: true,
      });

      await flushSceneEditorCanvasRender(subject, {
        skipRender: true,
      });

      expect(selectIsScenePageLoading).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(100);
      expect(selectIsScenePageLoading).toHaveBeenCalledOnce();
    } finally {
      unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("reports a failed canvas render that no caller is waiting for", async () => {
    const subject = new Subject();
    const failure = new Error("Canvas render failed");
    const appService = {
      reportError: vi.fn(),
      showAlertWhenIdle: vi.fn(),
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const unmount = mountSceneEditorSubscriptions({
      subject,
      appService,
      i18n: {
        resourcePages: { errorTitle: "Error title" },
        scenesPage: {},
        sceneEditorPage: {
          errorDetailsLabel: "Details label:",
          failedRenderCanvas: "Canvas message",
        },
      },
      store: {
        selectIsScenePageLoading: () => {
          throw failure;
        },
      },
    });

    try {
      subject.next({
        action: "sceneEditor.renderCanvas",
        payload: { flush: true },
      });

      await vi.waitFor(() => {
        expect(appService.showAlertWhenIdle).toHaveBeenCalledWith({
          title: "Error title",
          message: "Canvas message\n\nDetails label:\nCanvas render failed",
        });
      });
      expect(appService.reportError).toHaveBeenCalledWith(failure, {
        operation: "sceneEditor.renderCanvas",
      });

      // Edits keep re-rendering; the failure is reported again but not
      // alerted again.
      subject.next({
        action: "sceneEditor.renderCanvas",
        payload: { flush: true },
      });
      await vi.waitFor(() => {
        expect(appService.reportError).toHaveBeenCalledTimes(2);
      });
      expect(appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    } finally {
      unmount();
      consoleError.mockRestore();
    }
  });

  describe("when the page leaves the project during a canvas render", () => {
    const i18n = {
      resourcePages: { errorTitle: "Error title" },
      scenesPage: {},
      sceneEditorPage: {
        errorDetailsLabel: "Details label:",
        failedRenderCanvas: "Canvas message",
      },
    };
    // Each page loads its own image: loaded files are cached across renders.
    const createLeavingPage = (fileId) => {
      const projectData = createProjectData();
      projectData.resources.images["bg-leave"] = {
        id: "bg-leave",
        fileId,
        width: 1920,
        height: 1080,
      };
      projectData.story.scenes["scene-1"].sections[
        "section-1"
      ].lines[1].actions.background = { resourceId: "bg-leave" };
      const page = {
        canvasRoot: { isConnected: true },
        projectOpen: true,
      };
      const graphicsService = createGraphicsService();
      graphicsService.attachCanvas = vi.fn(async () => {});
      graphicsService.loadAssets = vi.fn(
        () =>
          new Promise((resolve) => {
            page.finishAssetLoad = resolve;
          }),
      );
      const projectService = {
        getFileContent: vi.fn(async (fileId) => ({ url: fileId })),
        // The open project's repository is gone once the user has left it.
        getRepositoryState: vi.fn(() => {
          if (!page.projectOpen) {
            throw new Error(
              "Repository not initialized. Call ensureRepository() first.",
            );
          }
          return {};
        }),
      };
      const store = {
        selectIsScenePageLoading: () => false,
        selectPreviewScene: () => ({ previewVisible: false }),
        selectSceneId: () => "scene-1",
        selectSelectedSectionId: () => "section-1",
        selectSelectedLineId: () => "line-2",
        selectProjectData: () => projectData,
        selectTemporaryPresentationState: () => ({}),
        selectIsBackgroundTransformEditorOpen: () => false,
        selectScene: () => ({ sections: [{ id: "section-1" }] }),
        selectIsMuted: () => false,
        setPresentationState: vi.fn(),
        setSectionLineChanges: vi.fn(),
      };
      const appService = {
        reportError: vi.fn(),
        showAlertWhenIdle: vi.fn(),
      };
      const subject = new Subject();
      subject.dispatch = (action, payload) => {
        subject.next({ action, payload });
      };
      page.deps = {
        subject,
        appService,
        graphicsService,
        projectService,
        store,
        render: vi.fn(),
        refs: {
          previewCanvasHost: { getCanvasRoot: () => page.canvasRoot },
        },
        i18n,
      };
      return page;
    };

    it("stops the render once its canvas is gone", async () => {
      const page = createLeavingPage("bg-leave-stop.png");
      const { appService, projectService, subject } = page.deps;
      const unmount = mountSceneEditorSubscriptions(page.deps);

      subject.dispatch("sceneEditor.renderCanvas", { flush: true });
      await vi.waitFor(() => {
        expect(page.finishAssetLoad).toBeTypeOf("function");
      });
      const repositoryReads = projectService.getRepositoryState.mock.calls;
      const readsBeforeLeaving = repositoryReads.length;

      // Leaving for the Projects list unmounts the page and closes the project
      // while the line's assets are still loading.
      unmount();
      page.canvasRoot.isConnected = false;
      page.projectOpen = false;
      page.finishAssetLoad();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(repositoryReads.length).toBe(readsBeforeLeaving);
      expect(appService.reportError).not.toHaveBeenCalled();
      expect(appService.showAlertWhenIdle).not.toHaveBeenCalled();
    });

    it("drops a failure that arrives after the page unmounted", async () => {
      const page = createLeavingPage("bg-leave-drop.png");
      const { appService, subject } = page.deps;
      const consoleWarn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const unmount = mountSceneEditorSubscriptions(page.deps);

      try {
        subject.dispatch("sceneEditor.renderCanvas", { flush: true });
        await vi.waitFor(() => {
          expect(page.finishAssetLoad).toBeTypeOf("function");
        });

        // The canvas element can outlive the page briefly; the render then
        // fails on the closed project.
        unmount();
        page.projectOpen = false;
        page.finishAssetLoad();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(appService.reportError).not.toHaveBeenCalled();
        expect(appService.showAlertWhenIdle).not.toHaveBeenCalled();
        expect(consoleWarn).toHaveBeenCalledOnce();
      } finally {
        consoleWarn.mockRestore();
      }
    });

    it("still reports and alerts a failure while the page is open", async () => {
      const page = createLeavingPage("bg-leave-open.png");
      const { appService, subject } = page.deps;
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const unmount = mountSceneEditorSubscriptions(page.deps);

      try {
        subject.dispatch("sceneEditor.renderCanvas", { flush: true });
        await vi.waitFor(() => {
          expect(page.finishAssetLoad).toBeTypeOf("function");
        });

        page.projectOpen = false;
        page.finishAssetLoad();

        await vi.waitFor(() => {
          expect(appService.showAlertWhenIdle).toHaveBeenCalledWith({
            title: "Error title",
            message:
              "Canvas message\n\nDetails label:\nRepository not initialized. Call ensureRepository() first.",
          });
        });
        expect(appService.reportError).toHaveBeenCalledOnce();
      } finally {
        unmount();
        consoleError.mockRestore();
      }
    });
  });

  it("reports and alerts a failed render after the canvas wheel moves to another line", async () => {
    const subject = new Subject();
    subject.dispatch = (action, payload) => {
      subject.next({ action, payload });
    };
    const failure = new Error("Canvas render failed");
    const appService = {
      reportError: vi.fn(),
      showAlertWhenIdle: vi.fn(),
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const unhandledRejections = [];
    const onUnhandledRejection = (reason) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);
    let selectedLineId = "line-2";
    const store = {
      selectSelectedLineId: () => selectedLineId,
      selectSelectedSectionId: () => "section-1",
      selectPreviousLineId: () => "line-1",
      selectNextLineId: () => undefined,
      setSelectedLineId: ({ selectedLineId: lineId }) => {
        selectedLineId = lineId;
      },
      // The render of the line the wheel moved to fails.
      selectSceneId: () => {
        throw failure;
      },
    };
    const unmount = mountSceneEditorSubscriptions({
      subject,
      appService,
      store,
      refs: {},
      render: vi.fn(),
      i18n: {
        resourcePages: { errorTitle: "Error title" },
        scenesPage: {},
        sceneEditorPage: {
          errorDetailsLabel: "Details label:",
          failedRenderCanvas: "Canvas message",
        },
      },
    });
    const canvasRoot = new EventTarget();

    try {
      subject.dispatch("sceneEditor.canvasMounted", { canvasRoot });
      const wheel = new Event("wheel");
      wheel.deltaY = -10;
      canvasRoot.dispatchEvent(wheel);

      await vi.waitFor(() => {
        expect(appService.showAlertWhenIdle).toHaveBeenCalledWith({
          title: "Error title",
          message: "Canvas message\n\nDetails label:\nCanvas render failed",
        });
      });
      expect(selectedLineId).toBe("line-1");
      expect(appService.reportError).toHaveBeenCalledWith(failure, {
        operation: "sceneEditor.renderCanvas",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandledRejections).toEqual([]);
    } finally {
      unmount();
      process.off("unhandledRejection", onUnhandledRejection);
      consoleError.mockRestore();
    }
  });

  it("reports and alerts a failed return from the full-screen preview", async () => {
    const failure = new Error("Canvas render failed");
    const appService = {
      reportError: vi.fn(),
      showAlertWhenIdle: vi.fn(),
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await expect(
        restoreSceneEditorFromPreview({
          appService,
          i18n: {
            resourcePages: { errorTitle: "Error title" },
            scenesPage: {},
            sceneEditorPage: {
              errorDetailsLabel: "Details label:",
              failedRenderCanvas: "Canvas message",
            },
          },
          store: {
            selectSceneId: () => {
              throw failure;
            },
          },
        }),
      ).resolves.toBeUndefined();

      expect(appService.reportError).toHaveBeenCalledWith(failure, {
        operation: "sceneEditor.restoreFromPreview",
      });
      expect(appService.showAlertWhenIdle).toHaveBeenCalledWith({
        title: "Error title",
        message: "Canvas message\n\nDetails label:\nCanvas render failed",
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("names a computed variable that a canvas render could not calculate", async () => {
    const subject = new Subject();
    const failure = new Error(
      'Computed variable "variable-1" expected type number, got number',
    );
    const appService = {
      reportError: vi.fn(),
      showAlertWhenIdle: vi.fn(),
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const unmount = mountSceneEditorSubscriptions({
      subject,
      appService,
      projectService: {
        getRepositoryState: () => ({
          variables: {
            items: {
              "variable-1": {
                id: "variable-1",
                type: "variable",
                name: "Ratio",
                computed: { expr: { div: [1, 0] } },
              },
            },
          },
        }),
      },
      i18n: {
        resourcePages: { errorTitle: "Error title" },
        scenesPage: {},
        sceneEditorPage: {
          computedVariableFailed: "Could not calculate “{name}”.",
          failedRenderCanvas: "Canvas message",
        },
      },
      store: {
        selectIsScenePageLoading: () => {
          throw failure;
        },
      },
    });

    try {
      subject.next({
        action: "sceneEditor.renderCanvas",
        payload: { flush: true },
      });

      await vi.waitFor(() => {
        expect(appService.showAlertWhenIdle).toHaveBeenCalledWith({
          title: "Error title",
          message: "Could not calculate “Ratio”.",
        });
      });
    } finally {
      unmount();
      consoleError.mockRestore();
    }
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

  it("refreshes Audio Effect resources before initializing Route Engine", async () => {
    const projectData = createProjectData();
    projectData.resources.audioEffects = {};
    projectData.resources.sounds.track = {
      fileId: "track.ogg",
      fileType: "audio/ogg",
    };
    projectData.resources.sounds.previous = {
      fileId: "previous.ogg",
      fileType: "audio/ogg",
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[0].actions.bgm = {
      loop: true,
      sounds: [
        {
          id: "previous",
          resourceId: "previous",
          loop: false,
          endEffect: {
            resourceId: "fade-in",
            playback: { speed: 2 },
          },
        },
      ],
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[1].actions.bgm = {
      loop: true,
      sounds: [
        {
          id: "incoming",
          resourceId: "track",
          loop: false,
          beginEffect: {
            resourceId: "fade-in",
            playback: { speed: 1 },
          },
          endEffect: {
            resourceId: "fade-in",
            playback: { speed: 1 },
          },
        },
      ],
    };

    const graphicsService = createGraphicsService();
    let engine;
    const initializedProjectData = [];
    graphicsService.initRouteEngine = (engineProjectData, options = {}) => {
      initializedProjectData.push(engineProjectData);
      const handlePendingEffects = createEffectsHandler({
        getEngine: () => engine,
        persistence: {
          saveSlots: vi.fn().mockResolvedValue(undefined),
          saveGlobalDeviceVariables: vi.fn().mockResolvedValue(undefined),
          saveGlobalAccountVariables: vi.fn().mockResolvedValue(undefined),
          saveGlobalRuntime: vi.fn().mockResolvedValue(undefined),
          applyScopedDataUpdates: vi.fn().mockResolvedValue(undefined),
        },
        routeGraphics: {
          render: (renderState) => {
            options.onSuppressedRenderState?.({
              renderState,
              systemState: engine.selectSystemState(),
            });
          },
        },
        ticker: {
          add: vi.fn(),
          remove: vi.fn(),
        },
      });
      engine = createRouteEngine({ handlePendingEffects });
      engine.init({
        initialState: {
          global: {},
          projectData: engineProjectData,
        },
      });
    };
    graphicsService.engineSelectPresentationState = () =>
      engine.selectPresentationState();
    graphicsService.engineSelectRenderState = () => engine.selectRenderState();
    graphicsService.engineHandleActions = (actions, eventContext, options) =>
      engine.handleActions(actions, eventContext, options);
    graphicsService.engineRenderCurrentState = vi.fn();
    const store = {
      ...createWarningStore(),
      canvasAudioPreviewKey: undefined,
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectCanvasAudioPreviewKey: () => store.canvasAudioPreviewKey,
      selectPreviousPresentationState: () => ({
        bgm: {
          loop: true,
          sounds: [
            {
              id: "previous",
              resourceId: "previous",
              loop: false,
              endEffect: {
                resourceId: "fade-in",
                playback: { speed: 2 },
              },
            },
          ],
        },
      }),
      selectProjectData: () => projectData,
      selectIsMuted: () => false,
      setCanvasAudioPreviewKey: ({ previewKey }) => {
        store.canvasAudioPreviewKey = previewKey;
      },
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
    };
    const projectService = {
      getFileContent: async () => ({
        type: "audio/ogg",
        url: "blob:http://localhost/track.ogg",
      }),
      getRepositoryState: () => ({
        audioEffects: {
          items: {
            "fade-in": {
              id: "fade-in",
              type: "audioEffect",
              name: "Fade In",
              audioEffect: {
                type: "update",
                tween: {
                  volume: {
                    initialValue: 25,
                    keyframes: [{ startValue: 0, value: 100, duration: 500 }],
                  },
                },
              },
            },
          },
        },
      }),
    };

    await expect(
      renderSceneEditorState({
        store,
        graphicsService,
        projectService,
        appService: { showAlert: vi.fn() },
      }),
    ).resolves.toBeUndefined();
    expect(initializedProjectData[0].resources.audioEffects["fade-in"]).toEqual(
      expect.objectContaining({
        type: "update",
      }),
    );
    expect(
      initializedProjectData[0].story.scenes["scene-1"].sections[
        "section-1"
      ].lines.find((line) => line.id === "line-2").actions.bgm.sounds[0]
        .beginEffect,
    ).toEqual({ resourceId: "fade-in", playback: { speed: 1 } });
    expect(graphicsService.engineRenderCurrentState).toHaveBeenCalledWith(
      expect.objectContaining({
        renderState: expect.objectContaining({
          audio: [
            expect.objectContaining({
              children: [
                expect.objectContaining({
                  id: "bgm:incoming",
                  beginEffect: {
                    volume: {
                      initialValue: 25,
                      keyframes: [
                        expect.objectContaining({
                          startValue: 0,
                          value: 100,
                          duration: 500,
                        }),
                      ],
                    },
                  },
                  endEffect: {
                    volume: {
                      initialValue: 25,
                      keyframes: [
                        expect.objectContaining({ value: 100, duration: 500 }),
                      ],
                    },
                  },
                }),
              ],
            }),
          ],
        }),
      }),
    );

    graphicsService.engineRenderCurrentState.mockClear();
    await expect(
      renderSceneEditorState({
        store,
        graphicsService,
        projectService,
        appService: { showAlert: vi.fn() },
      }),
    ).resolves.toBeUndefined();
    const secondRenderOptions =
      graphicsService.engineRenderCurrentState.mock.calls[0][0];
    expect(secondRenderOptions.renderState.audioEffects).toBeUndefined();
    expect(secondRenderOptions.renderState.audio[0].children[0]).toHaveProperty(
      "beginEffect",
    );
  });

  it("settles the selected line without replaying its update audio effect", async () => {
    const projectData = createProjectData();
    projectData.resources.sounds.track = {
      fileId: "track.ogg",
      fileType: "audio/ogg",
    };
    projectData.resources.audioEffects = {
      "volume-update": {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 18, duration: 500 }],
          },
        },
      },
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[1].actions.bgm = {
      volume: 75,
      sounds: [
        {
          id: "main",
          resourceId: "track",
          volume: 50,
        },
      ],
      audioEffects: {
        resourceId: "volume-update",
        playback: { speed: 1 },
      },
    };

    const graphicsService = createGraphicsService();
    const store = {
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => "line-2",
      selectProjectData: () => projectData,
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
    };

    graphicsService.loadAssets = vi.fn(async () => {});
    await expect(
      renderSceneEditorState({
        store,
        graphicsService,
        projectService: {
          getFileContent: async (fileId) => ({ url: `asset://${fileId}` }),
        },
      }),
    ).resolves.toBeUndefined();
    expect(store.presentationState.bgm.volume).toBe(18);
    expect(store.presentationState.bgm.sounds[0].volume).toBe(100);
    expect(
      projectData.story.scenes["scene-1"].sections["section-1"].lines[1].actions
        .bgm.audioEffects,
    ).toEqual({
      resourceId: "volume-update",
      playback: { speed: 1 },
    });
  });

  it("does not replay a temporary audio effect from an artificial line entry", async () => {
    const projectData = createProjectData();
    projectData.resources.sounds.track = {
      fileId: "track.ogg",
      fileType: "audio/ogg",
    };
    projectData.resources.audioEffects = {
      "volume-update": {
        type: "update",
        tween: {
          volume: {
            keyframes: [{ value: 35, duration: 500 }],
          },
        },
      },
    };
    const temporaryPresentationState = {
      bgm: {
        volume: 35,
        sounds: [{ id: "main", resourceId: "track" }],
        audioEffects: {
          resourceId: "volume-update",
          playback: { speed: 1 },
        },
      },
    };
    const graphicsService = createGraphicsService();
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
    };

    graphicsService.loadAssets = vi.fn(async () => {});
    await expect(
      renderSceneEditorState({
        store,
        graphicsService,
        projectService: {
          getFileContent: async (fileId) => ({ url: `asset://${fileId}` }),
        },
      }),
    ).resolves.toBeUndefined();
    expect(graphicsService.engineSelectPresentationState().bgm.volume).toBe(35);
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

  it("keeps section presentation changes based on committed data during temporary background previews", async () => {
    const projectData = createProjectData();
    projectData.resources.colors = {
      "background-committed": {
        id: "background-committed",
        hex: "#111111",
      },
      "background-temporary": {
        id: "background-temporary",
        hex: "#eeeeee",
      },
    };
    projectData.story.scenes["scene-1"].sections[
      "section-1"
    ].lines[1].actions.background = {
      colorId: "background-committed",
    };
    const graphicsService = createGraphicsService();
    let temporaryPresentationState = {
      background: {
        colorId: "background-temporary",
      },
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
      selectTemporaryPresentationState: () => temporaryPresentationState,
      selectScene: () => ({
        sections: [{ id: "section-1" }],
      }),
      selectIsMuted: () => false,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
      setSectionLineChanges: ({ changes }) => {
        store.sectionLineChanges = changes;
      },
    };
    const deps = {
      store,
      render: vi.fn(),
      graphicsService,
      refs: {
        previewCanvasHost: {
          getCanvasRoot: () => ({
            isConnected: true,
          }),
        },
      },
    };

    await renderSceneEditorCanvas(deps, {
      skipAnimations: true,
    });

    const selectedLineChange = store.sectionLineChanges.lines.find(
      (line) => line.id === "line-2",
    );
    expect(selectedLineChange.presentationState.background.colorId).toBe(
      "background-committed",
    );
    expect(
      graphicsService.engineSelectPresentationState()?.background?.colorId,
    ).toBe("background-temporary");

    temporaryPresentationState = {};
    await renderSceneEditorCanvas(deps, {
      skipAnimations: true,
    });

    expect(store.presentationState.background.colorId).toBe(
      "background-committed",
    );
    expect(
      graphicsService.engineSelectPresentationState()?.background?.colorId,
    ).toBe("background-committed");
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
      renderState: expect.any(Object),
      skipAudio: false,
      skipAnimations: true,
    });
    expect(engineRenderCurrentState).toHaveBeenNthCalledWith(2, {
      preserveAnimationPlayback: false,
      renderState: expect.any(Object),
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
      renderState: expect.any(Object),
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

  describe("with the background transform editor open", () => {
    const BACKGROUND_SPRITE_ID = "bg-cg-background-sprite";
    const OUTLINE_ANCHOR_ID = "selected-border-anchor";
    // A transform chosen in an inspector popover, with another anchor and
    // scale than the editor's own.
    const PREVIEW_TRANSFORM = {
      x: 700,
      y: 120,
      anchorX: 0,
      anchorY: 0,
      scaleX: 2,
      scaleY: 2,
    };

    const findRenderedElement = (elements = [], id) => {
      for (const element of elements) {
        if (element.id === id) {
          return element;
        }
        const child = findRenderedElement(element.children, id);
        if (child) {
          return child;
        }
      }
    };

    const createEditorOpenDeps = () => {
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
        x: 100,
        y: 120,
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
      graphicsService.parse = ({ elements }) => ({ elements });
      graphicsService.render = vi.fn();
      const state = createInitialState();
      openBackgroundTransformEditor(
        { state },
        {
          targetType: "background",
          background: { resourceId: "bg-school" },
          transform: { x: 100, y: 120 },
        },
      );
      const store = {
        selectIsScenePageLoading: () => false,
        selectPreviewScene: () => ({ previewVisible: false }),
        selectSceneId: () => "scene-1",
        selectSelectedSectionId: () => "section-1",
        selectSelectedLineId: () => "line-2",
        selectProjectData: () => projectData,
        selectTemporaryPresentationState: () => ({}),
        selectIsBackgroundTransformEditorOpen: () =>
          selectIsBackgroundTransformEditorOpen({ state }),
        selectBackgroundTransformEditor: () =>
          selectBackgroundTransformEditor({ state }),
        // The store hands out immutable snapshots, so a read keeps its value
        // when the state changes after it.
        selectCanvasBackgroundTransformEditor: vi.fn(() =>
          structuredClone(selectCanvasBackgroundTransformEditor({ state })),
        ),
        setBackgroundTransformEditorSelectedElementMetrics: vi.fn(),
        selectIsMuted: () => false,
        setPresentationState: vi.fn(),
      };

      return {
        state,
        graphicsService,
        deps: {
          store,
          graphicsService,
          projectService: {
            getFileContent: vi.fn(async (fileId) => ({ url: fileId })),
          },
          refs: {
            systemActions: {
              transformedHandlers: {
                handleGetBackgroundTransformPreviewCanvasRoot: () => ({
                  isConnected: true,
                }),
              },
            },
          },
        },
      };
    };

    it("draws the committed transform and keeps the rendered target metrics", async () => {
      const { deps, graphicsService } = createEditorOpenDeps();

      await renderSceneEditorState(deps, { skipAnimations: true });

      const [renderState] = graphicsService.render.mock.calls.at(-1);
      expect(
        findRenderedElement(renderState.elements, BACKGROUND_SPRITE_ID),
      ).toMatchObject({
        x: 100,
        y: 120,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1,
        scaleY: 1,
        originX: 1920,
        originY: 1080,
      });
      expect(
        deps.store.setBackgroundTransformEditorSelectedElementMetrics,
      ).toHaveBeenCalledTimes(1);
      expect(
        deps.store.setBackgroundTransformEditorSelectedElementMetrics,
      ).toHaveBeenCalledWith({
        metrics: expect.objectContaining({ width: 3840, height: 2160 }),
      });
    });

    it("draws a previewed transform without keeping its rendered target metrics", async () => {
      const { deps, graphicsService, state } = createEditorOpenDeps();
      setBackgroundTransformEditorPreviewTransform(
        { state },
        { transform: PREVIEW_TRANSFORM },
      );

      await renderSceneEditorState(deps, { skipAnimations: true });

      const [renderState] = graphicsService.render.mock.calls.at(-1);
      // The previewed anchor sets the drawn origin, as the committed one does.
      expect(
        findRenderedElement(renderState.elements, BACKGROUND_SPRITE_ID),
      ).toMatchObject({
        x: 700,
        y: 120,
        anchorX: 0,
        anchorY: 0,
        scaleX: 2,
        scaleY: 2,
        originX: 0,
        originY: 0,
      });
      // The kept metrics set the committed transform's origin, which a preview
      // with another scale must not change.
      expect(
        deps.store.setBackgroundTransformEditorSelectedElementMetrics,
      ).not.toHaveBeenCalled();
      expect(state.backgroundTransformEditor.transform).toMatchObject({
        x: 100,
        y: 120,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1,
        scaleY: 1,
      });
    });

    // The editor is read once, before the render waits for anything, so the
    // scene (built from it) and the outline (drawn around the scene, with its
    // anchor marker at the transform's anchor) cannot disagree. The marker is
    // at the anchor of the 3840 x 2160 target, less half of its 8 unit size.
    it("draws the scene and the outline from one read of the editor when a preview starts during the render", async () => {
      const { deps, graphicsService, state } = createEditorOpenDeps();
      // The preview starts while the render waits for the canvas, after the
      // scene was built.
      graphicsService.attachCanvas.mockImplementationOnce(async () => {
        setBackgroundTransformEditorPreviewTransform(
          { state },
          { transform: PREVIEW_TRANSFORM },
        );
      });

      await renderSceneEditorState(deps, { skipAnimations: true });

      expect(state.backgroundTransformEditor.previewTransform).toBeDefined();
      expect(
        deps.store.selectCanvasBackgroundTransformEditor,
      ).toHaveBeenCalledTimes(1);
      const [renderState] = graphicsService.render.mock.calls.at(-1);
      expect(
        findRenderedElement(renderState.elements, BACKGROUND_SPRITE_ID),
      ).toMatchObject({ x: 100, anchorX: 0.5, anchorY: 0.5, scaleX: 1 });
      expect(
        findRenderedElement(renderState.elements, OUTLINE_ANCHOR_ID),
      ).toMatchObject({ x: 1916, y: 1076 });
      // What it read had no preview, so the committed transform keeps its
      // metrics.
      expect(
        deps.store.setBackgroundTransformEditorSelectedElementMetrics,
      ).toHaveBeenCalledTimes(1);
    });

    it("draws the scene and the outline from one read of the editor when a preview ends during the render", async () => {
      const { deps, graphicsService, state } = createEditorOpenDeps();
      setBackgroundTransformEditorPreviewTransform(
        { state },
        { transform: PREVIEW_TRANSFORM },
      );
      // The preview ends while the render waits for the canvas, after the
      // scene was built.
      graphicsService.attachCanvas.mockImplementationOnce(async () => {
        clearBackgroundTransformEditorPreviewTransform({ state });
      });

      await renderSceneEditorState(deps, { skipAnimations: true });

      expect(state.backgroundTransformEditor.previewTransform).toBeUndefined();
      expect(
        deps.store.selectCanvasBackgroundTransformEditor,
      ).toHaveBeenCalledTimes(1);
      const [renderState] = graphicsService.render.mock.calls.at(-1);
      expect(
        findRenderedElement(renderState.elements, BACKGROUND_SPRITE_ID),
      ).toMatchObject({ x: 700, anchorX: 0, anchorY: 0, scaleX: 2 });
      expect(
        findRenderedElement(renderState.elements, OUTLINE_ANCHOR_ID),
      ).toMatchObject({ x: -4, y: -4 });
      // What it read was a preview, so the committed transform keeps its
      // metrics as they were.
      expect(
        deps.store.setBackgroundTransformEditorSelectedElementMetrics,
      ).not.toHaveBeenCalled();
    });
  });

  it("immediately retries a failed scene video and caches it after recovery", async () => {
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
      ...createWarningStore(),
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
      appService: { showAlert: vi.fn() },
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
    const firstReadCount = projectService.getFileContent.mock.calls.length;
    const firstAlertCount = deps.appService.showAlert.mock.calls.length;
    expect(firstReadCount).toBeGreaterThan(0);
    graphicsService.loadAssets.mockResolvedValue(undefined);

    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });

    expect(projectService.getFileContent).toHaveBeenCalledTimes(
      firstReadCount + 1,
    );
    expect(deps.appService.showAlert).toHaveBeenCalledTimes(firstAlertCount);
    expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
      "Videos:",
    );
    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });
    expect(projectService.getFileContent).toHaveBeenCalledTimes(
      firstReadCount + 1,
    );
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
      ...createWarningStore(),
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
      appService: { showAlert: vi.fn() },
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
    const firstLoadCount = graphicsService.loadAssets.mock.calls.length;
    await renderSceneEditorCanvas(deps, {
      skipRender: true,
      skipAnimations: true,
    });

    expect(graphicsService.loadAssets.mock.calls.length).toBeGreaterThan(
      firstLoadCount,
    );
    expect(
      graphicsService.loadAssets.mock.calls
        .slice(firstLoadCount)
        .map(([assets]) => Object.keys(assets)),
    ).toEqual([["bad-video.mp4"], ["bad-video.mp4"]]);
    expect(loadedAssetIds.has("good-video.mp4")).toBe(true);
    expect(loadedAssetIds.has("bad-video.mp4")).toBe(false);
    expect(deps.appService.showAlert).toHaveBeenCalledOnce();
    expect(deps.appService.showAlert.mock.calls[0][0].message).toContain(
      "Videos:",
    );
    expect(
      projectService.getFileContent.mock.calls.filter(
        ([fileId]) => fileId === "good-video.mp4",
      ),
    ).toHaveLength(1);
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

describe("scene editor canvas entry line", () => {
  // Runs line actions through Route Engine's effects handler, as the app does,
  // so the canvas follows a line that routes away.
  const createLineActionGraphicsService = () => {
    let engine;
    const graphicsService = createGraphicsService();
    graphicsService.initRouteEngine = (projectData) => {
      const handlePendingEffects = createEffectsHandler({
        getEngine: () => engine,
        persistence: {
          saveSlots: vi.fn().mockResolvedValue(undefined),
          saveGlobalDeviceVariables: vi.fn().mockResolvedValue(undefined),
          saveGlobalAccountVariables: vi.fn().mockResolvedValue(undefined),
          saveGlobalRuntime: vi.fn().mockResolvedValue(undefined),
          applyScopedDataUpdates: vi.fn().mockResolvedValue(undefined),
        },
        routeGraphics: { render: () => {} },
        ticker: { add: vi.fn(), remove: vi.fn() },
      });
      engine = createRouteEngine({ handlePendingEffects });
      engine.init({ initialState: { global: {}, projectData } });
    };
    graphicsService.engineSelectPresentationState = () =>
      engine.selectPresentationState();
    graphicsService.engineSelectRenderState = () => engine.selectRenderState();
    graphicsService.engineHandleActions = (actions, eventContext, options) =>
      engine.handleActions(actions, eventContext, options);
    return graphicsService;
  };

  const createCanvasStore = (projectData, { lineId }) => {
    const store = {
      selectSceneId: () => "scene-1",
      selectSelectedSectionId: () => "section-1",
      selectSelectedLineId: () => lineId,
      selectProjectData: () => projectData,
      selectIsMuted: () => true,
      setPresentationState: ({ presentationState }) => {
        store.presentationState = presentationState;
      },
    };
    return store;
  };

  const getFirstLine = (projectData) =>
    projectData.story.scenes["scene-1"].sections["section-1"].lines[0];

  const renderCanvasLine = async (projectData, { lineId }) => {
    const store = createCanvasStore(projectData, { lineId });
    await renderSceneEditorState({
      store,
      graphicsService: createLineActionGraphicsService(),
    });
    return store.presentationState?.dialogue?.content?.[0]?.text;
  };

  // Each loops back to the selected line itself: Route Engine stops such a
  // loop with "exceeded 1000 synchronous effect batches".
  it.each([
    ["a story reset", { resetStoryAtSection: { sectionId: "section-1" } }],
    [
      "a conditional transition",
      {
        conditional: {
          branches: [
            { actions: { sectionTransition: { sectionId: "section-1" } } },
          ],
        },
      },
    ],
  ])(
    "shows a selected line that loops back to itself through %s",
    async (_label, routing) => {
      const projectData = createProjectData();
      Object.assign(getFirstLine(projectData).actions, routing);
      const original = structuredClone(projectData);

      await expect(
        renderCanvasLine(projectData, { lineId: "line-1" }),
      ).resolves.toBe("first");
      // The canvas works on a copy; the project keeps the actions.
      expect(projectData).toEqual(original);
    },
  );

  it("does not continue past a selected line whose conditional stays", async () => {
    const projectData = createProjectData();
    getFirstLine(projectData).actions.conditional = {
      branches: [{ actions: {} }],
    };

    await expect(
      renderCanvasLine(projectData, { lineId: "line-1" }),
    ).resolves.toBe("first");
  });

  it("enters the section's first line without its transition when the selected line is not in the section", async () => {
    const projectData = createProjectData();
    getFirstLine(projectData).actions.sectionTransition = {
      sectionId: "section-1",
    };

    await expect(
      renderCanvasLine(projectData, { lineId: "line-removed" }),
    ).resolves.toBe("first");
  });
});

describe("scene editor canvas transition loop", () => {
  const createLoopError = () =>
    Object.assign(
      new Error(
        'RouteEngine exceeded 1000 synchronous effect batches at section "section-1", line "line-2". Check for an immediate routing cycle.',
      ),
      {
        code: "routing_cycle",
        pointer: { sectionId: "section-1", lineId: "line-2" },
      },
    );
  // Route Engine wraps a loop in an AggregateError when its cleanup fails too.
  const createWrappedLoopError = () =>
    new AggregateError([createLoopError()], "Cleanup also failed");

  const i18n = {
    resourcePages: { errorTitle: "Error title" },
    scenesPage: {},
    sceneEditorPage: {
      errorDetailsLabel: "Details label:",
      failedRenderCanvas: "Canvas message",
      transitionLoop: "Loop message",
    },
  };
  const LOOP_ALERT = { title: "Error title", message: "Loop message" };
  const ORDINARY_ALERT = {
    title: "Error title",
    message: "Canvas message\n\nDetails label:\nCanvas render failed",
  };

  const createSubject = () => {
    const subject = new Subject();
    subject.dispatch = (action, payload) => {
      subject.next({ action, payload });
    };
    return subject;
  };

  const createAppService = () => ({
    reportError: vi.fn(),
    showAlertWhenIdle: vi.fn(),
  });

  const silenceConsoleError = () =>
    vi.spyOn(console, "error").mockImplementation(() => {});

  it.each([
    ["a routing cycle", createLoopError],
    ["a routing cycle inside an AggregateError", createWrappedLoopError],
  ])(
    "explains %s in a canvas render without reporting it",
    async (_label, createError) => {
      const subject = createSubject();
      const appService = createAppService();
      let pageLoading = () => {
        throw createError();
      };
      const unmount = mountSceneEditorSubscriptions({
        subject,
        appService,
        i18n,
        store: { selectIsScenePageLoading: () => pageLoading() },
      });
      const consoleError = silenceConsoleError();

      try {
        subject.dispatch("sceneEditor.renderCanvas", { flush: true });

        await vi.waitFor(() => {
          expect(appService.showAlertWhenIdle).toHaveBeenCalledWith(LOOP_ALERT);
        });
        expect(appService.reportError).not.toHaveBeenCalled();

        // The canvas still renders the next selection.
        pageLoading = () => true;
        await expect(
          flushSceneEditorCanvasRender(subject),
        ).resolves.toBeUndefined();
        expect(appService.showAlertWhenIdle).toHaveBeenCalledOnce();
      } finally {
        unmount();
        consoleError.mockRestore();
      }
    },
  );

  it("explains a routing cycle on return from the full-screen preview without reporting it", async () => {
    const appService = createAppService();
    const consoleError = silenceConsoleError();

    try {
      await restoreSceneEditorFromPreview({
        appService,
        i18n,
        store: {
          selectSceneId: () => {
            throw createLoopError();
          },
        },
      });

      expect(appService.showAlertWhenIdle).toHaveBeenCalledWith(LOOP_ALERT);
      expect(appService.reportError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  describe("when the engine fails after the canvas moves on", () => {
    const mountWithRenderCounter = () => {
      const subject = createSubject();
      const appService = createAppService();
      const dispatched = [];
      const dispatch = subject.dispatch;
      subject.dispatch = (action, payload) => {
        dispatched.push({ action, payload });
        dispatch(action, payload);
      };
      // A render of the rebuilt canvas reads this first.
      const selectIsScenePageLoading = vi.fn(() => true);
      const unmount = mountSceneEditorSubscriptions({
        subject,
        appService,
        i18n,
        store: {
          selectIsScenePageLoading,
          // A press, click or scroll on the canvas reads the selected line
          // before it moves the story on.
          selectSelectedLineId: () => "line-1",
          selectSelectedSectionId: () => "section-1",
          selectNextLineId: () => undefined,
          selectPreviousLineId: () => undefined,
        },
      });
      return {
        subject,
        appService,
        dispatched,
        selectIsScenePageLoading,
        unmount,
      };
    };

    it.each([
      ["a routing cycle", createLoopError],
      ["a routing cycle inside an AggregateError", createWrappedLoopError],
    ])(
      "explains %s without reporting it and builds the canvas again",
      async (_label, createError) => {
        const {
          subject,
          appService,
          dispatched,
          selectIsScenePageLoading,
          unmount,
        } = mountWithRenderCounter();
        const consoleError = silenceConsoleError();

        try {
          subject.dispatch("sceneEditor.canvasPlaybackFailed", {
            error: createError(),
          });

          expect(appService.showAlertWhenIdle).toHaveBeenCalledWith(LOOP_ALERT);
          expect(appService.reportError).not.toHaveBeenCalled();
          expect(dispatched).toContainEqual({
            action: "sceneEditor.renderCanvas",
            payload: { flush: true, rebuildAfterPlaybackFailure: true },
          });
          await vi.waitFor(() => {
            expect(selectIsScenePageLoading).toHaveBeenCalledOnce();
          });
        } finally {
          unmount();
          consoleError.mockRestore();
        }
      },
    );

    it("still reports and alerts an ordinary error, and builds the canvas again", async () => {
      const failure = new Error("Canvas render failed");
      const {
        subject,
        appService,
        dispatched,
        selectIsScenePageLoading,
        unmount,
      } = mountWithRenderCounter();
      const consoleError = silenceConsoleError();

      try {
        subject.dispatch("sceneEditor.canvasPlaybackFailed", {
          error: failure,
        });

        expect(appService.showAlertWhenIdle).toHaveBeenCalledWith(
          ORDINARY_ALERT,
        );
        expect(appService.reportError).toHaveBeenCalledWith(failure, {
          operation: "sceneEditor.renderCanvas",
        });
        expect(dispatched).toContainEqual({
          action: "sceneEditor.renderCanvas",
          payload: { flush: true, rebuildAfterPlaybackFailure: true },
        });
        await vi.waitFor(() => {
          expect(selectIsScenePageLoading).toHaveBeenCalledOnce();
        });
      } finally {
        unmount();
        consoleError.mockRestore();
      }
    });

    describe("when it fails again right after the canvas was built again", () => {
      // A line that moves on by itself into a loop fails again every time its
      // canvas is built, with no input in between.
      const mountWithCanvas = () => {
        const mounted = mountWithRenderCounter();
        const canvasRoot = new EventTarget();
        mounted.subject.dispatch("sceneEditor.canvasMounted", { canvasRoot });
        return {
          ...mounted,
          canvasRoot,
          rebuilds: () =>
            mounted.dispatched.filter(
              ({ action, payload }) =>
                action === "sceneEditor.renderCanvas" &&
                payload.rebuildAfterPlaybackFailure === true,
            ).length,
          // Lets the rebuild finish, which also ends "alert once".
          finishRebuild: async () => {
            await vi.waitFor(() => {
              expect(mounted.selectIsScenePageLoading).toHaveBeenCalled();
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
          },
        };
      };

      it("builds the canvas again once and alerts once", async () => {
        const mounted = mountWithCanvas();
        const { subject, appService, unmount } = mounted;
        const consoleError = silenceConsoleError();

        try {
          subject.dispatch("sceneEditor.canvasPlaybackFailed", {
            error: createLoopError(),
          });
          await mounted.finishRebuild();
          expect(mounted.rebuilds()).toBe(1);

          subject.dispatch("sceneEditor.canvasPlaybackFailed", {
            error: createLoopError(),
          });
          subject.dispatch("sceneEditor.canvasPlaybackFailed", {
            error: createLoopError(),
          });
          await new Promise((resolve) => setTimeout(resolve, 0));

          expect(mounted.rebuilds()).toBe(1);
          expect(appService.showAlertWhenIdle).toHaveBeenCalledOnce();
          expect(appService.reportError).not.toHaveBeenCalled();
          expect(mounted.selectIsScenePageLoading).toHaveBeenCalledOnce();
        } finally {
          unmount();
          consoleError.mockRestore();
        }
      });

      it("keeps reporting an ordinary error that repeats, without alerting again", async () => {
        const failure = new Error("Canvas render failed");
        const mounted = mountWithCanvas();
        const { subject, appService, unmount } = mounted;
        const consoleError = silenceConsoleError();

        try {
          subject.dispatch("sceneEditor.canvasPlaybackFailed", {
            error: failure,
          });
          await mounted.finishRebuild();
          subject.dispatch("sceneEditor.canvasPlaybackFailed", {
            error: failure,
          });

          expect(mounted.rebuilds()).toBe(1);
          expect(appService.showAlertWhenIdle).toHaveBeenCalledOnce();
          expect(appService.reportError).toHaveBeenCalledTimes(2);
        } finally {
          unmount();
          consoleError.mockRestore();
        }
      });

      it.each([
        [
          "a press on the canvas",
          ({ canvasRoot }) =>
            canvasRoot.dispatchEvent(new Event("pointerdown")),
        ],
        [
          "a click on the canvas",
          ({ canvasRoot }) => canvasRoot.dispatchEvent(new Event("click")),
        ],
        [
          "a scroll over the canvas",
          ({ canvasRoot }) => canvasRoot.dispatchEvent(new Event("wheel")),
        ],
        [
          "a request to render the canvas",
          ({ subject }) =>
            subject.dispatch("sceneEditor.renderCanvas", { flush: true }),
        ],
      ])("builds the canvas again after %s", async (_label, interact) => {
        const mounted = mountWithCanvas();
        const { subject, appService, unmount } = mounted;
        const consoleError = silenceConsoleError();

        try {
          subject.dispatch("sceneEditor.canvasPlaybackFailed", {
            error: createLoopError(),
          });
          await mounted.finishRebuild();

          interact(mounted);
          await new Promise((resolve) => setTimeout(resolve, 0));
          subject.dispatch("sceneEditor.canvasPlaybackFailed", {
            error: createLoopError(),
          });

          expect(mounted.rebuilds()).toBe(2);
          expect(appService.showAlertWhenIdle).toHaveBeenCalledTimes(2);
        } finally {
          unmount();
          consoleError.mockRestore();
        }
      });
    });
  });

  describe("graphics playback errors", () => {
    const createDeps = () => {
      const subject = createSubject();
      const canvasRoot = { isConnected: true };
      const stop = new Error("Graphics stopped for the test");
      const graphicsService = { init: vi.fn().mockRejectedValue(stop) };
      return {
        stop,
        deps: {
          subject,
          graphicsService,
          appService: {
            ...createAppService(),
            getPayload: () => ({ s: "scene-1" }),
          },
          i18n,
          refs: { previewCanvasHost: { getCanvasRoot: () => canvasRoot } },
          render: vi.fn(),
          syncProjectState: vi.fn(),
          projectService: {
            ensureRepository: vi.fn(),
            setActiveSceneId: vi.fn(),
            getRepositoryState: () => ({}),
          },
          store: {
            hidePreviewScene: vi.fn(),
            selectSceneId: () => "scene-1",
            selectScene: () => ({}),
            setSceneId: vi.fn(),
            selectSelectedSectionId: () => "section-1",
            selectSelectedLineId: () => "line-1",
            selectProjectData: () => createProjectData(),
            selectIsScenePageLoading: () => false,
            selectIsSceneAssetLoading: () => false,
            setScenePageLoading: vi.fn(),
            setSceneAssetLoading: vi.fn(),
            setSceneLoadingProgress: vi.fn(),
          },
        },
      };
    };

    const expectPlaybackErrorHandler = ({ deps }) => {
      const [{ onPlaybackError }] = deps.graphicsService.init.mock.calls[0];
      expect(onPlaybackError).toEqual(expect.any(Function));

      // The failure reaches the subscriptions, which alert the user.
      const failure = createLoopError();
      const events = [];
      const subscription = deps.subject.subscribe((event) =>
        events.push(event),
      );
      onPlaybackError(failure);
      subscription.unsubscribe();
      expect(events).toEqual([
        {
          action: "sceneEditor.canvasPlaybackFailed",
          payload: { error: failure },
        },
      ]);
    };

    it("hands the engine failures of the canvas to the editor when the page starts", async () => {
      const setup = createDeps();

      await expect(initializeSceneEditorPage(setup.deps)).rejects.toBe(
        setup.stop,
      );

      expectPlaybackErrorHandler(setup);
    });

    it("hands the engine failures of the canvas to the editor when the full-screen preview closes", async () => {
      const setup = createDeps();
      const consoleError = silenceConsoleError();

      try {
        await restoreSceneEditorFromPreview(setup.deps);
      } finally {
        consoleError.mockRestore();
      }

      expectPlaybackErrorHandler(setup);
    });
  });
});

describe("scene editor return from the full-screen preview", () => {
  it("starts the engine in snapshot audio mode", async () => {
    // Another render may already have painted the selected line's audio, and
    // the editor canvas never plays audio transitions. A strict engine would
    // send the transition as an enter on that existing node and fail.
    const stop = new Error("Engine stopped for the test");
    const initRouteEngine = vi.fn(() => {
      throw stop;
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const canvasRoot = { isConnected: true };
    const reportError = vi.fn();

    try {
      await restoreSceneEditorFromPreview({
        subject: { dispatch: vi.fn() },
        graphicsService: {
          init: vi.fn(async () => {}),
          initRouteEngine,
        },
        appService: {
          reportError,
          showAlertWhenIdle: vi.fn(),
        },
        i18n: {
          resourcePages: { errorTitle: "Error title" },
          scenesPage: {},
          sceneEditorPage: {
            errorDetailsLabel: "Details label:",
            failedRenderCanvas: "Canvas message",
          },
        },
        refs: { previewCanvasHost: { getCanvasRoot: () => canvasRoot } },
        render: vi.fn(),
        store: {
          hidePreviewScene: vi.fn(),
          selectSceneId: () => "scene-1",
          selectSelectedSectionId: () => "section-1",
          selectSelectedLineId: () => "line-1",
          selectProjectData: () => createProjectData(),
          selectIsScenePageLoading: () => false,
          selectIsSceneAssetLoading: () => false,
          setCanvasAudioPreviewKey: vi.fn(),
          setScenePageLoading: vi.fn(),
          setSceneAssetLoading: vi.fn(),
          setSceneLoadingProgress: vi.fn(),
        },
      });
    } finally {
      consoleError.mockRestore();
    }

    expect(reportError).toHaveBeenCalledWith(stop, {
      operation: "sceneEditor.restoreFromPreview",
    });
    expect(initRouteEngine).toHaveBeenCalledOnce();
    expect(initRouteEngine.mock.calls[0][1]).toMatchObject({
      audioEffectsMode: "snapshot",
    });
  });
});
