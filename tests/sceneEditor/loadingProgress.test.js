import { afterEach, expect, it, vi } from "vitest";
import * as actions from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import {
  setSceneEditorPageLoading,
  setSceneEditorAssetLoading,
  disposeSceneLoadingDetails,
} from "../../src/internal/ui/sceneEditor/loadingProgress.js";
import { EN_I18N } from "../support/i18n.js";

afterEach(() => vi.useRealTimers());

const setup = () => {
  vi.useFakeTimers();
  const state = actions.createInitialState();
  state.isScenePageLoading = false;
  const context = { state, i18n: EN_I18N };
  const store = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (payload) => action(context, payload),
    ]),
  );
  return {
    deps: { store, render: vi.fn() },
    view: () => actions.selectViewData(context),
  };
};

it("reveals the latest progress at five seconds without requiring another progress event", async () => {
  const { deps, view } = setup();
  setSceneEditorPageLoading(deps, true);
  deps.store.setSceneLoadingProgress({ stage: "graphics" });
  expect(view().loadingSceneLabel).toBe("Loading scene...");
  await vi.advanceTimersByTimeAsync(4000);
  deps.store.setSceneLoadingProgress({
    stage: "reading",
    completed: 3,
    total: 8,
    assetName: "Images: Image One",
  });
  await vi.advanceTimersByTimeAsync(999);
  expect(view().loadingSceneLabel).toBe("Loading scene...");
  expect(view().loadingAssetName).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(view().loadingSceneLabel).toBe("Checking assets: 3 / 8");
  expect(view().loadingAssetName).toBe("Images: Image One");
  expect(deps.render).toHaveBeenCalledOnce();
  setSceneEditorPageLoading(deps, false);
  expect(vi.getTimerCount()).toBe(0);
});

it("resets the delay for each asset-loading episode and ignores fast loads", async () => {
  const { deps, view } = setup();
  setSceneEditorAssetLoading(deps, true);
  deps.store.setSceneLoadingProgress({
    stage: "decoding",
    completed: 1,
    total: 2,
    assetName: "Fonts: Font One",
  });
  expect(view().loadingAssetsLabel).toBe("Loading assets...");
  await vi.advanceTimersByTimeAsync(2000);
  setSceneEditorAssetLoading(deps, false);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(4000);
  setSceneEditorAssetLoading(deps, true);
  await vi.advanceTimersByTimeAsync(4999);
  expect(view().loadingAssetsLabel).toBe("Loading assets...");
  await vi.advanceTimersByTimeAsync(1);
  expect(view().loadingAssetsLabel).toBe("Loading assets: 1 / 2");
  setSceneEditorAssetLoading(deps, false);
  expect(view().loadingAssetName).toBeUndefined();
});

it("keeps one deadline across overlapping page and asset loading", async () => {
  const { deps, view } = setup();
  setSceneEditorPageLoading(deps, true);
  await vi.advanceTimersByTimeAsync(3000);
  setSceneEditorAssetLoading(deps, true);
  setSceneEditorPageLoading(deps, false);
  deps.store.setSceneLoadingProgress({
    stage: "decoding",
    completed: 2,
    total: 4,
  });
  await vi.advanceTimersByTimeAsync(2000);
  expect(view().loadingAssetsLabel).toBe("Loading assets: 2 / 4");
  setSceneEditorAssetLoading(deps, false);
});

it("cancels the timer on unmount and does not restart from late async work", async () => {
  const { deps } = setup();
  setSceneEditorPageLoading(deps, true);
  disposeSceneLoadingDetails(deps.store);
  setSceneEditorAssetLoading(deps, false);
  deps.render.mockClear();
  await vi.advanceTimersByTimeAsync(6000);
  expect(deps.render).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
