import { afterEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import * as sceneStore from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handleAfterMount,
  handleBeforeMount,
  handleHidePreviewScene,
  handleCopySceneErrorDetails,
  handleRetrySceneInitialization,
  prepareSceneEditorNavigation,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import {
  initializeSceneEditorPage,
  mountSceneEditorSubscriptions,
  resetSceneEditorRuntime,
  restoreSceneEditorFromPreview,
} from "../../src/internal/ui/sceneEditor/runtime.js";
import { cancelSceneInitialization } from "../../src/internal/ui/sceneEditor/initialization.js";
import { stopSceneLoadingDetails } from "../../src/internal/ui/sceneEditor/loadingProgress.js";
import { EN_I18N } from "../support/i18n.js";

vi.mock(
  "../../src/internal/ui/sceneEditor/runtime.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    initializeSceneEditorPage: vi.fn(),
    mountSceneEditorSubscriptions: vi.fn(),
    resetSceneEditorRuntime: vi.fn(),
    restoreSceneEditorFromPreview: vi.fn(),
  }),
);

const stores = [];
const createDeps = () => {
  const context = { state: sceneStore.createInitialState(), i18n: EN_I18N };
  const store = Object.fromEntries(
    Object.entries(sceneStore).map(([name, fn]) => [
      name,
      (...args) => fn(context, ...args),
    ]),
  );
  stores.push(store);
  const subject = new Subject();
  subject.dispatch = vi.fn();
  vi.mocked(mountSceneEditorSubscriptions).mockReturnValue(() => {});
  return {
    store,
    subject,
    refs: {},
    render: vi.fn(),
    i18n: EN_I18N,
    projectService: {
      getRepositoryState: vi.fn(() => ({})),
      getDomainState: vi.fn(() => ({})),
      getRepositoryRevision: vi.fn(() => 0),
      getEnsuredProjectId: () => "project-one",
      subscribeProjectState: vi.fn(() => () => {}),
      clearActiveSceneId: vi.fn(async () => {}),
      syncSectionLinesSnapshot: vi.fn(),
      getCurrentProjectInfo: vi.fn(async () => ({ language: "en" })),
      cacheSceneTextStats: vi.fn(),
    },
    appService: {
      getUserConfig: vi.fn(),
      registerBeforeNavigation: vi.fn(() => () => {}),
      copyText: vi.fn(),
      showToast: vi.fn(),
      showAlert: vi.fn(),
      navigate: vi.fn(),
      getPayload: () => ({ s: "scene-one" }),
    },
  };
};

const sceneSnapshot = (text, lineId = "line-one") => ({
  scenes: {
    "scene-one": { id: "scene-one", sectionIds: ["section-one"] },
  },
  sections: {
    "section-one": { id: "section-one", lineIds: [lineId] },
  },
  lines: {
    [lineId]: {
      id: lineId,
      sectionId: "section-one",
      actions: { dialogue: { content: [{ text }] } },
    },
  },
});

const selectInitialScene = (store, domainState) => {
  store.setSceneId({ sceneId: "scene-one" });
  store.setDomainState({ domainState });
  store.setSelectedSectionId({ selectedSectionId: "section-one" });
  store.setSelectedLineId({ selectedLineId: "line-one" });
};

afterEach(() => {
  stores.splice(0).forEach((store) => {
    cancelSceneInitialization(store);
    stopSceneLoadingDetails(store);
  });
  vi.resetAllMocks();
});

describe("scene initialization recovery", () => {
  it("applies the latest project snapshot before enabling editing after startup", async () => {
    const deps = createDeps();
    let publish;
    deps.projectService.subscribeProjectState.mockImplementation((next) => {
      publish = next;
      return () => {};
    });
    const cleanup = handleBeforeMount(deps);
    let finishGraphics;
    vi.mocked(initializeSceneEditorPage).mockImplementationOnce(() => {
      selectInitialScene(deps.store, sceneSnapshot("Original"));
      return new Promise((resolve) => {
        finishGraphics = resolve;
      });
    });
    let finishProjectInfo;
    deps.projectService.getCurrentProjectInfo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishProjectInfo = resolve;
        }),
    );
    const loading = handleAfterMount(deps);
    const update = (revision, text, lineId) => {
      const domainState = sceneSnapshot(text, lineId);
      deps.projectService.getDomainState.mockReturnValue(domainState);
      deps.projectService.getRepositoryRevision.mockReturnValue(revision);
      publish({ repositoryState: {}, domainState, revision });
    };
    update(1, "During graphics", "line-two");
    finishGraphics();
    await vi.waitFor(() => expect(finishProjectInfo).toBeDefined());
    update(2, "Latest collaboration update", "line-three");
    expect(deps.store.selectSceneInitializationStatus()).toBe("loading");
    finishProjectInfo({ language: "en" });
    await loading;

    expect(deps.store.selectSceneInitializationStatus()).toBe("ready");
    expect(deps.store.selectRepositoryRevision()).toBe(2);
    expect(deps.store.selectSelectedLineId()).toBe("line-three");
    expect(
      deps.store.selectDraftSection().lines[0].actions.dialogue.content,
    ).toEqual([{ text: "Latest collaboration update" }]);
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      { skipAnimations: true },
    );
    await cleanup();
  });

  it.each(["backup", "navigation", "unmount"])(
    "awaits drafts entered during failed restoration before %s",
    async (operation) => {
      const deps = createDeps();
      const cleanup = handleBeforeMount(deps);
      const initial = sceneSnapshot("Original");
      deps.projectService.getDomainState.mockReturnValue(initial);
      selectInitialScene(deps.store, initial);
      deps.store.setSceneInitializationStatus({ status: "ready" });
      deps.store.setScenePageLoading({ isLoading: false });
      let failRestoration;
      vi.mocked(restoreSceneEditorFromPreview).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            failRestoration = reject;
          }),
      );
      const restoration = handleHidePreviewScene(deps);
      const edited = sceneSnapshot("Typed while restoring");
      deps.store.setDraftSection({
        draftSection: {
          sceneId: "scene-one",
          sectionId: "section-one",
          baseRevision: 0,
          dirty: true,
          isComposing: false,
          lastSource: "text",
          lines: [edited.lines["line-one"]],
        },
      });
      failRestoration(new Error("Renderer restore failed"));
      await restoration;
      let finishSave;
      deps.projectService.syncSectionLinesSnapshot.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishSave = () => {
              deps.projectService.getDomainState.mockReturnValue(edited);
              deps.projectService.getRepositoryRevision.mockReturnValue(1);
              resolve();
            };
          }),
      );
      const barrier =
        operation === "unmount"
          ? cleanup()
          : prepareSceneEditorNavigation(
              deps,
              operation === "backup"
                ? { reason: "backup" }
                : { path: "/project/scenes" },
            );
      let completed = false;
      barrier.then(() => {
        completed = true;
      });
      await vi.waitFor(() => expect(finishSave).toBeDefined());
      expect(completed).toBe(false);
      expect(deps.projectService.clearActiveSceneId).not.toHaveBeenCalled();
      expect(resetSceneEditorRuntime).not.toHaveBeenCalled();
      expect(deps.projectService.syncSectionLinesSnapshot).toHaveBeenCalledWith(
        {
          sectionId: "section-one",
          lines: [edited.lines["line-one"]],
        },
      );
      finishSave();
      await barrier;
      expect(deps.store.selectPendingDraftSections()).toEqual([]);
      if (operation !== "unmount") await cleanup();
    },
  );

  it("replaces a rejected initialization with a localized, non-editable failure state", async () => {
    const deps = createDeps();
    vi.mocked(initializeSceneEditorPage).mockRejectedValue(
      new Error("internal decoder detail"),
    );
    await handleAfterMount(deps);
    const view = deps.store.selectViewData();
    expect(view.isScenePageLoading).toBe(false);
    expect(view.isSceneAssetLoading).toBe(false);
    expect(view.sceneInitializationFailed).toBe(true);
    expect(view.sceneEditorUnavailable).toBe(true);
    expect(view.sceneInitializationError).toBe("internal decoder detail");
    expect(deps.store.selectSceneInitializationDiagnostics()).toContain(
      "Error: Error: internal decoder detail",
    );
    await handleCopySceneErrorDetails(deps);
    expect(deps.appService.copyText).toHaveBeenCalledWith(
      deps.store.selectSceneInitializationDiagnostics(),
    );
    deps.appService.copyText.mockRejectedValue(
      new Error("clipboard unavailable"),
    );
    await handleCopySceneErrorDetails(deps);
    expect(deps.appService.showToast).toHaveBeenLastCalledWith({
      message: EN_I18N.sceneEditorPage.failedCopySceneErrorDetails,
      status: "error",
    });
  });

  it("cleans up before retry, rejects duplicate clicks, and enables editing only on success", async () => {
    const deps = createDeps();
    vi.mocked(initializeSceneEditorPage).mockRejectedValueOnce(
      new Error("startup failed"),
    );
    await handleAfterMount(deps);
    let releaseCleanup;
    vi.mocked(resetSceneEditorRuntime).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseCleanup = resolve;
        }),
    );
    const retry = handleRetrySceneInitialization(deps);
    await handleRetrySceneInitialization(deps);
    expect(initializeSceneEditorPage).toHaveBeenCalledTimes(1);
    expect(deps.store.selectViewData().sceneEditorUnavailable).toBe(true);
    expect(deps.store.selectSceneInitializationDiagnostics()).toBe("");
    releaseCleanup();
    await retry;
    expect(resetSceneEditorRuntime).toHaveBeenCalledOnce();
    expect(initializeSceneEditorPage).toHaveBeenCalledTimes(2);
    expect(deps.store.selectSceneInitializationStatus()).toBe("ready");
    expect(deps.store.selectViewData().sceneEditorUnavailable).toBe(false);
  });

  it("remains recoverable when cleanup or another initialization fails", async () => {
    const deps = createDeps();
    vi.mocked(initializeSceneEditorPage).mockRejectedValue(
      new Error("startup failed"),
    );
    await handleAfterMount(deps);
    vi.mocked(resetSceneEditorRuntime).mockRejectedValueOnce(
      new Error("cleanup failed"),
    );
    await handleRetrySceneInitialization(deps);
    expect(initializeSceneEditorPage).toHaveBeenCalledTimes(1);
    expect(deps.store.selectSceneInitializationDiagnostics()).toContain(
      "Step: cleanup",
    );
    expect(deps.store.selectSceneInitializationStatus()).toBe("failed");
    await handleRetrySceneInitialization(deps);
    expect(initializeSceneEditorPage).toHaveBeenCalledTimes(2);
    expect(deps.store.selectViewData().isScenePageLoading).toBe(false);
    expect(deps.store.selectSceneInitializationStatus()).toBe("failed");
  });

  it.each([false, true])(
    "ignores late initialization after leaving (reject=%s)",
    async (reject) => {
      const deps = createDeps();
      let finish;
      let signal;
      vi.mocked(initializeSceneEditorPage).mockImplementationOnce((options) => {
        signal = options.signal;
        return new Promise((resolve, fail) => {
          finish = reject ? () => fail(new Error("late failure")) : resolve;
        });
      });
      const loading = handleAfterMount(deps);
      await prepareSceneEditorNavigation(deps, { path: "/project/scenes" });
      expect(signal.aborted).toBe(true);
      const renderCount = deps.render.mock.calls.length;
      finish();
      await loading;
      expect(deps.render).toHaveBeenCalledTimes(renderCount);
      expect(deps.projectService.getCurrentProjectInfo).not.toHaveBeenCalled();
      expect(deps.projectService.cacheSceneTextStats).not.toHaveBeenCalled();
      expect(deps.appService.showAlert).not.toHaveBeenCalled();
    },
  );

  it("shows the recovery screen when restoring the editor after preview fails", async () => {
    const deps = createDeps();
    deps.store.setSceneId({ sceneId: "scene-one" });
    deps.store.setSceneInitializationStatus({ status: "ready" });
    deps.store.setScenePageLoading({ isLoading: false });
    let failRestoration;
    vi.mocked(restoreSceneEditorFromPreview).mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          failRestoration = reject;
        }),
    );
    const restoration = handleHidePreviewScene(deps);
    expect(deps.store.selectSceneInitializationStatus()).toBe("ready");
    expect(deps.store.selectViewData().isScenePageLoading).toBe(false);
    expect(deps.store.selectViewData().sceneEditorUnavailable).toBe(false);
    failRestoration(new Error("Renderer restore failed"));
    await restoration;
    expect(deps.store.selectSceneInitializationStatus()).toBe("failed");
    expect(deps.store.selectViewData().sceneInitializationError).toBe(
      "Renderer restore failed",
    );
    expect(deps.store.selectViewData().isScenePageLoading).toBe(false);
    expect(deps.store.selectViewData().sceneEditorUnavailable).toBe(true);
  });

  it("does not mark a ready editor failed when its optional statistics cache rejects", async () => {
    const deps = createDeps();
    deps.store.setSceneId({ sceneId: "scene-one" });
    deps.projectService.cacheSceneTextStats.mockRejectedValue(
      new Error("cache failed"),
    );
    await handleAfterMount(deps);
    expect(deps.projectService.cacheSceneTextStats).toHaveBeenCalledOnce();
    expect(deps.store.selectSceneInitializationStatus()).toBe("ready");
    expect(deps.store.selectViewData().isScenePageLoading).toBe(false);
  });
});
