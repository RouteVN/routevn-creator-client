import { afterEach, describe, expect, it, vi } from "vitest";
import * as sceneStore from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  handleAfterMount,
  handleHidePreviewScene,
  handleCopySceneErrorDetails,
  handleRetrySceneInitialization,
  prepareSceneEditorNavigation,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";
import {
  initializeSceneEditorPage,
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
  return {
    store,
    refs: {},
    render: vi.fn(),
    i18n: EN_I18N,
    projectService: {
      getCurrentProjectInfo: vi.fn(async () => ({ language: "en" })),
      cacheSceneTextStats: vi.fn(),
    },
    appService: {
      copyText: vi.fn(),
      showToast: vi.fn(),
      showAlert: vi.fn(),
      navigate: vi.fn(),
      getPayload: () => ({ s: "scene-one" }),
    },
  };
};

afterEach(() => {
  stores.splice(0).forEach((store) => {
    cancelSceneInitialization(store);
    stopSceneLoadingDetails(store);
  });
  vi.resetAllMocks();
});

describe("scene initialization recovery", () => {
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
