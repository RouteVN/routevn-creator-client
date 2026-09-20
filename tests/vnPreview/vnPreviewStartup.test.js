import { afterEach, expect, it, vi } from "vitest";
import {
  startPreviewStartup,
  cancelPreviewStartup,
  syncPreviewLoadingDetails,
} from "../../src/components/vnPreview/support/vnPreviewStartup.js";
import {
  getAssetTimeoutMs,
  runAsyncOperation,
} from "../../src/internal/asyncOperation.js";
import {
  createInitialState,
  setLoadingProgress,
  selectLoadingDescription,
  selectIsPreviewLoading,
  selectViewData,
  setLoadingDetailsVisible,
  setPreviewReady,
  setAssetLoading,
} from "../../src/components/vnPreview/vnPreview.store.js";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const setup = () => {
  vi.useFakeTimers();
  const state = createInitialState();
  const store = {
    selectIsPreviewLoading: () => selectIsPreviewLoading({ state }),
    setLoadingDetailsVisible: (value) =>
      setLoadingDetailsVisible({ state }, value),
    setPreviewReady: (value) => setPreviewReady({ state }, value),
    setAssetLoading: (value) => setAssetLoading({ state }, value),
    setLoadingProgress: (value) => setLoadingProgress({ state }, value),
    selectLoadingDescription: () => selectLoadingDescription({ state }),
  };
  const deps = { store, render: vi.fn() };
  return {
    store,
    deps,
    view: () => selectViewData({ state, props: {} }),
    startup: startPreviewStartup(deps),
  };
};

it("times out a stuck stage after 30 seconds and names that stage", async () => {
  vi.useFakeTimers();
  const { startup } = setup();
  const result = startup
    .step("graphics", () => new Promise(() => {}))
    .catch((error) => error);
  await vi.advanceTimersByTimeAsync(29_999);
  await vi.advanceTimersByTimeAsync(1);
  const error = await result;
  expect(error.name).toBe("TimeoutError");
  expect(error.message).toBe("graphics timed out after 30 seconds.");
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels immediately and never continues after a late native result", async () => {
  const { startup, store } = setup();
  let finish;
  const continued = vi.fn();
  const result = startup
    .step(
      "repository",
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .then(continued)
    .catch((error) => error);
  await Promise.resolve();
  cancelPreviewStartup(store);
  expect((await result).name).toBe("AbortError");
  finish({});
  await Promise.resolve();
  expect(continued).not.toHaveBeenCalled();
});

it("cleans up a file returned after its deadline and aborts the underlying fetch", async () => {
  vi.useFakeTimers();
  let finish;
  let signal;
  const revoke = vi.fn();
  const result = runAsyncOperation(
    (operationSignal) => {
      signal = operationSignal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    { onLateResolve: (content) => content.revoke() },
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(30_000);
  expect((await result).name).toBe("TimeoutError");
  expect(signal.aborted).toBe(true);
  finish({ revoke });
  await Promise.resolve();
  await Promise.resolve();
  expect(revoke).toHaveBeenCalledOnce();
});

it("shows counts and the current named asset on separate lines", () => {
  const { startup, store } = setup();
  startup.progress({
    stage: "decoding",
    completed: 2,
    total: 4,
    assetName: "Images: Image One",
  });
  expect(store.selectLoadingDescription()).toBe(
    "Loading assets: 2 / 4\nImages: Image One",
  );
});

it("allows extra time for videos and large files, capped at two minutes", () => {
  expect(getAssetTimeoutMs()).toBe(30_000);
  expect(getAssetTimeoutMs({ type: "video/mp4" })).toBe(120_000);
  expect(getAssetTimeoutMs({ size: 100 * 1024 * 1024 })).toBe(90_000);
  expect(getAssetTimeoutMs({ size: 2 ** 40 })).toBe(120_000);
});

it("shows generic text for five seconds, then reveals the latest progress without another event", async () => {
  const { startup, view, deps } = setup();
  startup.progress({ stage: "graphics" });
  expect(view().loadingPreviewLabel).toBe("Loading preview...");
  await vi.advanceTimersByTimeAsync(4000);
  startup.progress({
    stage: "decoding",
    completed: 3,
    total: 8,
    assetName: "Images: Image One",
  });
  await vi.advanceTimersByTimeAsync(999);
  expect(view().loadingPreviewLabel).toBe("Loading preview...");
  expect(view().loadingPreviewAssetLabel).toBeUndefined();
  deps.render.mockClear();
  await vi.advanceTimersByTimeAsync(1);
  expect(view().loadingPreviewLabel).toBe("Loading assets: 3 / 8");
  expect(view().loadingPreviewAssetLabel).toBe("Images: Image One");
  expect(deps.render).toHaveBeenCalledOnce();
});

it("cancels the reveal on fast startup and resets the delay for subsequent asset loading", async () => {
  const { store, deps, view, startup } = setup();
  await vi.advanceTimersByTimeAsync(1000);
  store.setPreviewReady({ isPreviewReady: true });
  syncPreviewLoadingDetails(deps);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(5000);
  expect(view().loadingPreviewAssetLabel).toBeUndefined();
  store.setAssetLoading({ isLoading: true });
  syncPreviewLoadingDetails(deps);
  startup.progress({
    stage: "reading",
    completed: 1,
    total: 2,
    assetName: "Fonts: Font One",
  });
  await vi.advanceTimersByTimeAsync(4999);
  expect(view().loadingPreviewLabel).toBe("Loading preview...");
  await vi.advanceTimersByTimeAsync(1);
  expect(view().loadingPreviewLabel).toBe("Checking assets: 1 / 2");
  store.setAssetLoading({ isLoading: false });
  syncPreviewLoadingDetails(deps);
  expect(view().loadingPreviewAssetLabel).toBeUndefined();
});

it("clears the timer when closed and starts a fresh delay when reopened", async () => {
  const { store, deps, view } = setup();
  await vi.advanceTimersByTimeAsync(4000);
  cancelPreviewStartup(store);
  expect(vi.getTimerCount()).toBe(0);
  deps.render.mockClear();
  await vi.advanceTimersByTimeAsync(2000);
  expect(deps.render).not.toHaveBeenCalled();
  const reopened = startPreviewStartup(deps);
  reopened.progress({ stage: "graphics" });
  await vi.advanceTimersByTimeAsync(4999);
  expect(view().loadingPreviewLabel).toBe("Loading preview...");
  await vi.advanceTimersByTimeAsync(1);
  expect(view().loadingPreviewLabel).toBe("Initializing graphics...");
  cancelPreviewStartup(store);
});
