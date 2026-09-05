import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLE_PLAYER_INDEX_HTML } from "../../src/deps/services/shared/projectExportService.js";

const runtime = vi.hoisted(() => ({
  init: vi.fn(),
  render: vi.fn(),
  loadAssets: vi.fn(),
  resumeAudio: vi.fn(),
  tickerStart: vi.fn(),
}));

vi.mock("file-type", () => ({
  fileTypeFromBuffer: async () => ({ mime: "image/png" }),
}));
vi.mock("pixi.js", () => ({
  Ticker: class {
    start = runtime.tickerStart;
  },
}));
vi.mock("route-graphics", () => ({
  default: () => ({
    canvas: document.createElement("canvas"),
    init: async () => {},
    render: runtime.render,
    loadAssets: runtime.loadAssets,
    resumeAudio: runtime.resumeAudio,
  }),
}));
vi.mock("route-engine-js", () => ({
  default: ({ handlePendingEffects }) => ({
    init: runtime.init.mockImplementation(() =>
      handlePendingEffects([{ name: "handleLineActions" }]),
    ),
    handleLineActions: () => {},
    selectRenderState: () => ({
      elements: [
        { src: "image-one" },
        { src: "image-two" },
        { src: "image-one" },
      ],
    }),
    selectPresentationState: () => ({}),
  }),
  createIndexedDbPersistence: () => ({ load: async () => ({ saveSlots: {} }) }),
  createEffectsHandler: ({ routeGraphics }) => {
    const handler = () =>
      routeGraphics.render({
        elements: [
          { src: "image-one" },
          { src: "image-two" },
          { src: "image-one" },
        ],
      });
    handler.reset = vi.fn();
    handler.dispose = vi.fn();
    handler.reconcilePlaybackScheduleV1 = vi.fn();
    handler.createRouteGraphicsEventHandler = () => () => {};
    return handler;
  },
}));
vi.mock("../../src/internal/audioRenderState.js", () => ({
  prepareRenderStateAudioChannelsForGraphics: ({ renderState }) => renderState,
}));
vi.mock("../../src/internal/project/layout.js", () => ({
  prepareRenderStateKeyboardForGraphics: ({ renderState }) => renderState,
}));
vi.mock("../../src/internal/runtime/graphicsEngineRuntime.js", () => ({
  loadGraphicsEnginePlugins: async () => ({}),
  preloadRuntimeSaveSlotImages: async () => ({ failed: 0 }),
  createRuntimeEventContext: vi.fn(),
  getRuntimeEventActions: vi.fn(),
  prepareRuntimeInteractionExecution: vi.fn(),
}));
vi.mock(
  "../../src/deps/services/shared/projectExportService.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    createBundleRangeReader: async () => ({
      manifest: { assets: { "image-one": {}, "image-two": {} } },
      readInstructions: async () => ({
        projectData: { screen: { width: 1920, height: 1080 } },
        bundleMetadata: {
          project: { name: "Project One", namespace: "project-one" },
        },
      }),
      hasAsset: (id) => id === "image-one" || id === "image-two",
      readAsset: async () => ({
        buffer: new Uint8Array([1]),
        mime: "image/png",
      }),
    }),
  }),
);

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

describe("exported player startup", () => {
  let dom;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dom = new JSDOM(BUNDLE_PLAYER_INDEX_HTML, { url: "https://example.test/" });
    dom.window.matchMedia = () => ({ matches: false });
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("window", dom.window);
    runtime.loadAssets.mockResolvedValue([]);
    runtime.resumeAudio.mockResolvedValue(undefined);
  });

  afterEach(() => {
    dom.window.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads unique opening assets before start, then renders without a second loading phase", async () => {
    const first = deferred();
    const second = deferred();
    runtime.loadAssets.mockImplementation((assets) =>
      Object.hasOwn(assets, "image-one") ? first.promise : second.promise,
    );
    const loading = document.querySelector("#loading");
    const progress = document.querySelector("#loading-progress");
    const boot = import("../../scripts/main.js");
    await vi.waitFor(() => expect(runtime.loadAssets).toHaveBeenCalledTimes(2));

    expect(progress.value).toBe(20);
    expect(loading.classList.contains("ready")).toBe(false);
    expect(loading.querySelector("#loading-start").disabled).toBe(true);
    first.resolve([]);
    await vi.waitFor(() => expect(progress.value).toBe(60));
    expect(runtime.render).not.toHaveBeenCalled();
    expect(loading.classList.contains("hidden")).toBe(false);

    second.resolve([]);
    await vi.waitFor(() =>
      expect(loading.classList.contains("ready")).toBe(true),
    );
    expect(progress.value).toBe(100);
    expect(runtime.render).not.toHaveBeenCalled();
    expect(runtime.resumeAudio).not.toHaveBeenCalled();
    expect(runtime.tickerStart).not.toHaveBeenCalled();
    document
      .querySelector("#loading-start")
      .dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
    expect(runtime.resumeAudio).toHaveBeenCalledOnce();
    document.querySelector("#loading-start").click();
    await boot;
    expect(progress.value).toBe(100);
    expect(runtime.init).toHaveBeenCalledOnce();
    expect(runtime.loadAssets).toHaveBeenCalledTimes(2);
    expect(runtime.render).toHaveBeenCalledOnce();
    expect(runtime.tickerStart).toHaveBeenCalledOnce();
    expect(loading.classList.contains("ready")).toBe(true);
    expect(loading.classList.contains("hidden")).toBe(true);
  });

  it("shows a loading failure instead of leaving the progress screen stuck", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runtime.loadAssets.mockRejectedValue(new Error("Asset unavailable"));
    const boot = import("../../scripts/main.js");
    const loading = document.querySelector("#loading");
    await boot;

    expect(loading.classList.contains("error")).toBe(true);
    expect(loading.classList.contains("hidden")).toBe(false);
    expect(loading.querySelector(".loading-error-title").textContent).toBe(
      "Failed to load",
    );
    expect(runtime.render).not.toHaveBeenCalled();
    expect(runtime.tickerStart).not.toHaveBeenCalled();
    expect(loading.classList.contains("ready")).toBe(false);
  });

  it("keeps native startup automatic without adding a progress screen", async () => {
    document.body.dataset.playerStart = "automatic";
    document.querySelector("#loading").replaceChildren();
    await import("../../scripts/main.js");

    expect(runtime.init).toHaveBeenCalledOnce();
    expect(runtime.render).toHaveBeenCalledOnce();
    expect(document.querySelector("#loading-progress")).toBeNull();
    expect(
      document.querySelector("#loading").classList.contains("hidden"),
    ).toBe(true);
  });
});
