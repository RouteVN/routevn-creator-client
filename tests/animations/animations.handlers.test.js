import { describe, expect, it, vi } from "vitest";
import {
  handleAnimationItemClick,
  handleFileExplorerSelectionChanged,
} from "../../src/pages/animations/animations.handlers.js";

describe("animations.handlers", () => {
  it("selects an animation from the catalog without logging", () => {
    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => undefined),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        getState: vi.fn(() => ({
          isTouchMode: false,
          isMobileFileExplorerOpen: false,
        })),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    handleAnimationItemClick(deps, {
      _event: {
        detail: {
          itemId: "animation-1",
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "animation-1",
    });
    expect(deps.refs.fileExplorer.selectItem).toHaveBeenCalledWith({
      itemId: "animation-1",
    });
  });

  it("selects an animation from the file explorer without logging", () => {
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });

    const deps = {
      store: {
        selectSelectedItemId: vi.fn(() => undefined),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        getState: vi.fn(() => ({
          isTouchMode: false,
          isMobileFileExplorerOpen: false,
        })),
      },
      render: vi.fn(),
    };

    handleFileExplorerSelectionChanged(deps, {
      _event: {
        detail: {
          itemId: "animation-1",
          isFolder: false,
        },
      },
    });

    expect(deps.store.setSelectedItemId).toHaveBeenCalledWith({
      itemId: "animation-1",
    });

    vi.unstubAllGlobals();
  });

  it("renders the selected animation in the graphics preview canvas", async () => {
    let animationFrameCallback;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        animationFrameCallback = callback;
        return 7;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const selectedAnimation = {
      id: "animation-1",
      type: "animation",
      name: "Fade",
      animation: {
        type: "update",
        tween: {
          alpha: {
            keyframes: [
              {
                duration: 1000,
                value: 0,
                easing: "linear",
              },
            ],
          },
        },
      },
    };
    let previewRequestId;
    const deps = {
      appService: {
        showToast: vi.fn(),
      },
      graphicsService: {
        init: vi.fn(async () => {}),
        loadAssets: vi.fn(async () => {}),
        render: vi.fn(),
        setAnimationPlaybackMode: vi.fn(),
        setAnimationTime: vi.fn(),
      },
      projectService: {
        getRepositoryState: vi.fn(() => ({
          images: {
            items: {},
          },
          files: {},
        })),
      },
      refs: {
        detailCanvas: {},
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      store: {
        selectSelectedItemId: vi
          .fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValue("animation-1"),
        setSelectedItemId: vi.fn(),
        clearPreviewRuntime: vi.fn(),
        getState: vi.fn(() => ({
          isTouchMode: false,
          isMobileFileExplorerOpen: false,
        })),
        selectSelectedAnimation: vi.fn(() => selectedAnimation),
        selectProjectResolution: vi.fn(() => ({
          width: 800,
          height: 600,
        })),
        selectPreviewRuntime: vi.fn(() => ({})),
        setPreviewRuntime: vi.fn(),
        selectImagesData: vi.fn(() => ({
          items: {},
          tree: [],
        })),
        selectAnimationPreviewFrameId: vi.fn(() => undefined),
        clearAnimationPreviewPlayback: vi.fn(),
        selectAnimationPreviewStartedAtMs: vi.fn(() => undefined),
        setAnimationPreviewFrameId: vi.fn(),
        setAnimationPreviewStartedAtMs: vi.fn(),
        setAnimationPreviewRequestId: vi.fn(({ requestId } = {}) => {
          previewRequestId = requestId;
        }),
        selectAnimationPreviewRequestId: vi.fn(() => previewRequestId),
      },
      render: vi.fn(),
    };

    await handleAnimationItemClick(deps, {
      _event: {
        detail: {
          itemId: "animation-1",
        },
      },
    });

    expect(deps.graphicsService.init).toHaveBeenCalledWith({
      canvas: deps.refs.detailCanvas,
      width: 800,
      height: 600,
    });
    expect(deps.graphicsService.render).toHaveBeenCalledTimes(2);
    expect(deps.graphicsService.setAnimationPlaybackMode).toHaveBeenCalledWith(
      "manual",
    );
    expect(deps.graphicsService.setAnimationTime).toHaveBeenCalledWith(0);
    expect(
      deps.graphicsService.setAnimationTime.mock.invocationCallOrder[0],
    ).toBeLessThan(deps.graphicsService.render.mock.invocationCallOrder[0]);
    expect(deps.store.setAnimationPreviewFrameId).toHaveBeenCalledWith({
      frameId: 7,
    });

    await animationFrameCallback(250);

    expect(deps.store.setAnimationPreviewStartedAtMs).toHaveBeenCalledWith({
      startedAtMs: 250,
    });
    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(0);

    await animationFrameCallback(1250);

    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(999);

    await animationFrameCallback(1600);

    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(999);

    await animationFrameCallback(1800);

    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(999);

    await animationFrameCallback(2300);

    expect(deps.graphicsService.render).toHaveBeenCalledTimes(4);
    expect(deps.graphicsService.render.mock.calls[2][0].animations).toEqual([]);
    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(50);

    vi.unstubAllGlobals();
  });
});
