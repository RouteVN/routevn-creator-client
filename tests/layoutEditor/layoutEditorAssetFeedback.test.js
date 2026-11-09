import { expect, it, vi } from "vitest";
import {
  loadAvailableLayoutEditorAssets,
  waitForLayoutEditorVideos,
} from "../../src/components/layoutEditorCanvas/support/layoutEditorAssetFeedback.js";
import { omitUnavailableLayoutElements } from "../../src/components/layoutEditorCanvas/support/layoutEditorCanvasRender.js";
import * as actions from "../../src/components/layoutEditorCanvas/layoutEditorCanvas.store.js";

it("warns once for all failed layout assets, retries, and recovers without changing the layout", async () => {
  const context = { state: actions.createInitialState() };
  const store = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (payload) => action(context, payload),
    ]),
  );
  const repository = {
    fonts: { items: { font: { name: "Font One", fileId: "font" } } },
    images: { items: { image: { name: "Image One", fileId: "image" } } },
  };
  let broken = true;
  const deps = {
    store,
    appService: { showAlert: vi.fn() },
    projectService: {
      getEnsuredProjectId: () => "project-one",
      getRepositoryState: () => repository,
      getFileContent: vi.fn(async (id) => {
        if (broken && id === "font") throw new Error("font checksum mismatch");
        return { url: `asset://${id}` };
      }),
    },
    graphicsService: {
      hasLoadedAsset: () => false,
      loadAssets: vi.fn(async (assets) => {
        if (broken && assets.image) throw new Error("image decode failure");
      }),
    },
  };
  const references = ["font", "image", "healthy"].map((url) => ({ url }));
  for (let i = 0; i < 2; i++) {
    expect(
      await loadAvailableLayoutEditorAssets(deps, references, repository),
    ).toEqual(["font", "image"]);
  }
  expect(deps.appService.showAlert).toHaveBeenCalledOnce();
  const message = deps.appService.showAlert.mock.calls[0][0].message;
  expect(message).toContain("Fonts: Font One");
  expect(message).toContain("Images: Image One");
  const elements = [
    {
      type: "container",
      children: [
        { id: "text", type: "text", textStyle: { fontFamily: ["font"] } },
        { id: "image", type: "sprite", url: "image" },
        { id: "healthy", type: "sprite", url: "healthy" },
      ],
    },
  ];
  const before = structuredClone(elements);
  expect(
    omitUnavailableLayoutElements(elements, ["font", "image"])[0].children.map(
      ({ id }) => id,
    ),
  ).toEqual(["healthy"]);
  expect(elements).toEqual(before);
  broken = false;
  expect(
    await loadAvailableLayoutEditorAssets(deps, references, repository),
  ).toEqual([]);
  expect(deps.appService.showAlert).toHaveBeenCalledOnce();
});

it.each([undefined, "project-two"])(
  "drops a late layout load after project changes to %s",
  async (nextProject) => {
    let projectId = "project-one";
    let finish;
    const store = {
      selectCachedFileContent: vi.fn(),
      clearCachedFileContent: vi.fn(),
      cacheFileContent: vi.fn(),
      selectWarnedAssetFileIds: vi.fn(),
      markAssetWarningsShown: vi.fn(),
    };
    const deps = {
      store,
      appService: { showAlert: vi.fn() },
      projectService: {
        getEnsuredProjectId: () => projectId,
        getFileContent: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
      graphicsService: { hasLoadedAsset: () => false, loadAssets: vi.fn() },
    };
    const load = loadAvailableLayoutEditorAssets(deps, [{ url: "image" }], {});
    projectId = nextProject;
    finish({ url: "asset://image" });
    expect(await load).toEqual([]);
    expect(store.cacheFileContent).not.toHaveBeenCalled();
    expect(store.markAssetWarningsShown).not.toHaveBeenCalled();
    expect(deps.graphicsService.loadAssets).not.toHaveBeenCalled();
    expect(deps.appService.showAlert).not.toHaveBeenCalled();
  },
);

it("waits only for unready videos, remembers timeouts, and warns once", async () => {
  const context = { state: actions.createInitialState() };
  const store = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (payload) => action(context, payload),
    ]),
  );
  const ready = new Set(["ready"]);
  const timeout = Object.assign(new Error("timeout"), {
    code: "video_ready_timeout",
  });
  const graphicsService = {
    isVideoReady: vi.fn((id) => ready.has(id)),
    waitForVideosReady: vi.fn(async () => ({
      failures: [{ fileId: "slow", error: timeout }],
    })),
  };
  const deps = {
    store,
    graphicsService,
    appService: { showAlert: vi.fn() },
    projectService: {
      getEnsuredProjectId: () => "project-one",
      getRepositoryState: () => ({}),
    },
  };
  const onWaitStart = vi.fn();
  const fileReferences = [
    { url: "ready", type: "video/mp4" },
    { url: "slow", type: "video/mp4" },
    { url: "image", type: "image/png" },
  ];
  const call = () =>
    waitForLayoutEditorVideos(deps, {
      fileReferences,
      failedFileIds: [],
      onWaitStart,
    });
  expect(await call()).toEqual(["slow"]);
  expect(graphicsService.waitForVideosReady).toHaveBeenCalledWith(["slow"], {
    timeoutMs: 30000,
  });
  expect(onWaitStart).toHaveBeenCalledOnce();
  expect(deps.appService.showAlert).toHaveBeenCalledOnce();
  expect(await call()).toEqual(["slow"]);
  expect(graphicsService.waitForVideosReady).toHaveBeenCalledOnce();
  expect(onWaitStart).toHaveBeenCalledOnce();
  ready.add("slow");
  expect(await call()).toEqual([]);
  expect(deps.appService.showAlert).toHaveBeenCalledOnce();
});

it("does not wait or show loading for image-only and ready-video references", async () => {
  const deps = {
    store: { selectTimedOutVideoFileIds: () => [] },
    graphicsService: { isVideoReady: () => true, waitForVideosReady: vi.fn() },
    projectService: { getEnsuredProjectId: () => "project-one" },
  };
  const onWaitStart = vi.fn();
  expect(
    await waitForLayoutEditorVideos(deps, {
      fileReferences: [
        { url: "image", type: "image/png" },
        { url: "ready", type: "video/mp4" },
      ],
      failedFileIds: [],
      onWaitStart,
    }),
  ).toEqual([]);
  expect(onWaitStart).not.toHaveBeenCalled();
  expect(deps.graphicsService.waitForVideosReady).not.toHaveBeenCalled();
});

it("ignores video failures from stale renders", async () => {
  const context = { state: actions.createInitialState() };
  const store = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (payload) => action(context, payload),
    ]),
  );
  let current = true;
  let finish;
  const deps = {
    store,
    projectService: { getEnsuredProjectId: () => "project-one" },
    graphicsService: {
      isVideoReady: () => false,
      waitForVideosReady: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  };
  const pending = waitForLayoutEditorVideos(deps, {
    fileReferences: [{ url: "video", type: "video/mp4" }],
    failedFileIds: [],
    onWaitStart: vi.fn(),
    isRenderCurrent: () => current,
  });
  current = false;
  finish({
    failures: [{ fileId: "video", error: { code: "video_ready_timeout" } }],
  });
  expect(await pending).toEqual([]);
  expect(context.state.timedOutVideoFileIds).toEqual([]);
});

it("ties the loading indicator to the current render request", () => {
  const context = { state: actions.createInitialState() };
  actions.setActiveRenderRequestId(context, { requestId: "one" });
  actions.setVideoLoading(context, { requestId: "one", value: true });
  actions.setActiveRenderRequestId(context, { requestId: "two" });
  actions.setVideoLoading(context, { requestId: "two", value: true });
  actions.setVideoLoading(context, { requestId: "one", value: false });
  expect(context.state.videoLoadingRequestId).toBe("two");
  actions.setActiveRenderRequestId(context, { requestId: "three" });
  actions.setVideoLoading(context, { requestId: "one", value: true });
  expect(actions.selectIsVideoLoading(context)).toBe(false);
});
