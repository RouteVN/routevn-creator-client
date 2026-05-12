import { describe, expect, it, vi } from "vitest";
import {
  handleAddMaskClick,
  handleConfirmMaskImageSelection,
  handleEditMaskClick,
  handleOpenAddMaskClick,
  handlePreviewImageClick,
  handleReplayAnimation,
  handleRulerTimeHover,
  handleRulerTimeLeave,
  handleSavePreviewClick,
} from "../../src/pages/animationEditor/animationEditor.handlers.js";

describe("animationEditor.handlers", () => {
  it("opens a pending transition mask from the right panel", () => {
    const store = {
      startPendingTransitionMask: vi.fn(),
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleOpenAddMaskClick(
      {
        store,
        render,
      },
      {
        _event: {
          clientX: 40,
          clientY: 80,
        },
      },
    );

    expect(store.startPendingTransitionMask).toHaveBeenCalledWith({});
    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "addMask",
      x: 40,
      y: 80,
      payload: {},
    });
    expect(render).toHaveBeenCalled();
  });

  it("opens the mask editor dialog from the read-only mask summary", () => {
    const store = {
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleEditMaskClick(
      {
        store,
        render,
      },
      {
        _event: {
          clientX: 120,
          clientY: 160,
        },
      },
    );

    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "editMask",
      x: 120,
      y: 160,
      payload: {},
    });
    expect(render).toHaveBeenCalled();
  });

  it("commits a pending transition mask", () => {
    const store = {
      commitPendingTransitionMask: vi.fn(),
      closePopover: vi.fn(),
      selectPopover: vi.fn(() => ({
        mode: "none",
      })),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      queueAutosave: vi.fn(),
      selectAutosaveInFlight: vi.fn(() => false),
      selectAutosavePersistedVersion: vi.fn(() => 1),
      selectAutosaveVersion: vi.fn(() => 1),
    };
    const render = vi.fn();

    handleAddMaskClick({
      store,
      render,
    });

    expect(store.commitPendingTransitionMask).toHaveBeenCalledWith({});
    expect(store.closePopover).toHaveBeenCalledWith();
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalled();
    expect(store.queueAutosave).toHaveBeenCalled();
  });

  it("opens the shared image selector for preview slots", () => {
    const store = {
      selectPreviewImageId: vi.fn(() => "image-current"),
      showImageSelectorDialog: vi.fn(),
    };
    const render = vi.fn();

    handlePreviewImageClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              target: "preview-incoming",
            },
          },
        },
      },
    );

    expect(store.selectPreviewImageId).toHaveBeenCalledWith({
      target: "preview-incoming",
    });
    expect(store.showImageSelectorDialog).toHaveBeenCalledWith({
      target: "preview-incoming",
      index: undefined,
      selectedImageId: "image-current",
    });
    expect(render).toHaveBeenCalled();
  });

  it("commits preview image selections and updates the preview canvas", async () => {
    const resetState = {
      elements: [{ id: "bg" }],
      animations: [],
    };
    const renderState = {
      elements: [{ id: "next" }],
      animations: [],
    };
    const store = {
      selectImageSelectorDialog: vi.fn(() => ({
        target: "preview-background",
        selectedImageId: "image-bg",
      })),
      setPreviewImage: vi.fn(),
      hideImageSelectorDialog: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      selectPopover: vi.fn(() => ({
        mode: "none",
      })),
      queueAutosave: vi.fn(),
      selectPreviewPlayheadVisible: vi.fn(() => false),
      selectPreviewPlaybackMode: vi.fn(() => "auto"),
      selectPreviewPreparedVersion: vi.fn(() => undefined),
      selectPreviewRenderVersion: vi.fn(() => 1),
      setPreviewPlaybackMode: vi.fn(),
      markPreviewPrepared: vi.fn(),
      selectAnimationResetState: vi.fn(() => resetState),
      selectAnimationRenderStateWithAnimations: vi.fn(() => renderState),
    };
    const graphicsService = {
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    await handleConfirmMaskImageSelection({
      graphicsService,
      store,
      render,
    });

    expect(store.setPreviewImage).toHaveBeenCalledWith({
      target: "preview-background",
      imageId: "image-bg",
    });
    expect(store.hideImageSelectorDialog).toHaveBeenCalledWith({});
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalled();
    expect(store.queueAutosave).not.toHaveBeenCalled();
    expect(graphicsService.setAnimationPlaybackMode).toHaveBeenCalledWith(
      "manual",
    );
    expect(graphicsService.render).toHaveBeenNthCalledWith(1, resetState);
    expect(graphicsService.render).toHaveBeenNthCalledWith(2, renderState);
    expect(graphicsService.setAnimationTime).toHaveBeenCalledWith(0);
  });

  it("resets animation time before replaying from the preview render state", async () => {
    let requestAnimationFrameCallCount = 0;
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      requestAnimationFrameCallCount += 1;
      if (requestAnimationFrameCallCount === 1) {
        callback(0);
      }
      return requestAnimationFrameCallCount;
    });

    const resetState = {
      elements: [{ id: "reset" }],
      animations: [],
    };
    const renderState = {
      elements: [{ id: "preview" }],
      animations: [
        {
          id: "preview-animation-alpha",
          targetId: "preview",
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
      ],
    };
    let activePlaybackRequestId;
    const store = {
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      selectAnimationResetState: vi.fn(() => resetState),
      selectAnimationRenderStateWithAnimations: vi.fn(() => renderState),
      setPreviewPlaybackMode: vi.fn(),
      markPreviewPrepared: vi.fn(),
      selectPreviewDurationMs: vi.fn(() => 1000),
      startPreviewPlayback: vi.fn(),
      setPreviewPlaybackFrameId: vi.fn(),
      selectPreviewPlaybackStartedAtMs: vi.fn(() => 0),
      selectPreviewPlaybackDurationMs: vi.fn(() => 1000),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        activePlaybackRequestId = requestId;
      }),
      selectPreviewPlaybackRequestId: vi.fn(() => activePlaybackRequestId),
    };
    const graphicsService = {
      loadAssets: vi.fn(),
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    try {
      await handleReplayAnimation({
        graphicsService,
        projectService: {},
        render,
        store,
      });

      expect(graphicsService.setAnimationPlaybackMode).toHaveBeenNthCalledWith(
        1,
        "manual",
      );
      expect(graphicsService.setAnimationTime).toHaveBeenNthCalledWith(1, 0);
      expect(
        graphicsService.setAnimationTime.mock.invocationCallOrder[0],
      ).toBeLessThan(graphicsService.render.mock.invocationCallOrder[0]);
      expect(graphicsService.render).toHaveBeenNthCalledWith(1, resetState);
      expect(graphicsService.render).toHaveBeenNthCalledWith(2, renderState);
      expect(graphicsService.setAnimationPlaybackMode).toHaveBeenNthCalledWith(
        2,
        "auto",
      );
      expect(store.startPreviewPlayback).toHaveBeenCalledWith({
        startedAtMs: expect.any(Number),
        durationMs: 1000,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores stale replay continuations when Play is clicked again before finishing", async () => {
    const flushAsyncWork = async () => {
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    };
    const rafCallbacks = [];
    const timeoutCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal("setTimeout", (callback) => {
      timeoutCallbacks.push(callback);
      return timeoutCallbacks.length;
    });

    const resetState = {
      elements: [{ id: "reset" }],
      animations: [],
    };
    const renderState = {
      elements: [{ id: "preview" }],
      animations: [
        {
          id: "preview-animation-alpha",
          targetId: "preview",
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
      ],
    };
    let activePlaybackRequestId;
    let playbackStartedAtMs;
    let playbackDurationMs;
    const store = {
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      selectAnimationResetState: vi.fn(() => resetState),
      selectAnimationRenderStateWithAnimations: vi.fn(() => renderState),
      setPreviewPlaybackMode: vi.fn(),
      markPreviewPrepared: vi.fn(),
      selectPreviewDurationMs: vi.fn(() => 1000),
      startPreviewPlayback: vi.fn(({ startedAtMs, durationMs }) => {
        playbackStartedAtMs = startedAtMs;
        playbackDurationMs = durationMs;
      }),
      setPreviewPlaybackFrameId: vi.fn(),
      selectPreviewPlaybackStartedAtMs: vi.fn(() => playbackStartedAtMs),
      selectPreviewPlaybackDurationMs: vi.fn(() => playbackDurationMs),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        activePlaybackRequestId = requestId;
      }),
      selectPreviewPlaybackRequestId: vi.fn(() => activePlaybackRequestId),
      setPreviewPlayhead: vi.fn(),
    };
    const graphicsService = {
      loadAssets: vi.fn(),
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();
    const deps = {
      graphicsService,
      projectService: {},
      render,
      store,
    };

    try {
      let firstReplayDone = false;
      let firstReplayError;
      const firstReplay = handleReplayAnimation(deps)
        .catch((error) => {
          firstReplayError = error;
        })
        .finally(() => {
          firstReplayDone = true;
        });
      await flushAsyncWork();
      expect(rafCallbacks).toHaveLength(1);

      let secondReplayDone = false;
      let secondReplayError;
      const secondReplay = handleReplayAnimation(deps)
        .catch((error) => {
          secondReplayError = error;
        })
        .finally(() => {
          secondReplayDone = true;
        });
      await flushAsyncWork();
      expect(rafCallbacks).toHaveLength(2);

      rafCallbacks[0]?.(0);
      timeoutCallbacks[0]?.();
      await flushAsyncWork();
      expect(firstReplayDone).toBe(true);
      expect(firstReplayError).toBeUndefined();

      const autoCallsBeforeSecondCompletes =
        graphicsService.setAnimationPlaybackMode.mock.calls.filter(
          ([mode]) => mode === "auto",
        );
      expect(autoCallsBeforeSecondCompletes).toHaveLength(0);
      expect(store.startPreviewPlayback).not.toHaveBeenCalled();

      rafCallbacks[1]?.(16);
      timeoutCallbacks[1]?.();
      await flushAsyncWork();
      expect(secondReplayDone).toBe(true);
      expect(secondReplayError).toBeUndefined();

      const autoCallsAfterSecondCompletes =
        graphicsService.setAnimationPlaybackMode.mock.calls.filter(
          ([mode]) => mode === "auto",
        );
      expect(autoCallsAfterSecondCompletes).toHaveLength(1);
      expect(store.startPreviewPlayback).toHaveBeenCalledTimes(1);
      await firstReplay;
      await secondReplay;
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("tracks the current timeline hover time for later preview updates", async () => {
    const store = {
      setPreviewPlayhead: vi.fn(),
      selectPreviewPlaybackMode: vi.fn(() => "manual"),
      selectPreviewPreparedVersion: vi.fn(() => 1),
      selectPreviewRenderVersion: vi.fn(() => 1),
    };
    const graphicsService = {
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    await handleRulerTimeHover(
      {
        graphicsService,
        render,
        store,
      },
      {
        _event: {
          detail: {
            timeMs: 420,
          },
        },
      },
    );

    expect(store.setPreviewPlayhead).toHaveBeenCalledWith({
      timeMs: 420,
      visible: true,
    });
    expect(graphicsService.setAnimationTime).toHaveBeenCalledWith(420);
    expect(render).not.toHaveBeenCalled();
  });

  it("leaves the preview at the hovered timeline time when the pointer leaves", () => {
    const graphicsService = {
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
    };
    const store = {
      selectPreviewPlaybackFrameId: vi.fn(),
      selectAnimationResetState: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      setPreviewPlaybackMode: vi.fn(),
    };
    const render = vi.fn();

    handleRulerTimeLeave({
      graphicsService,
      render,
      store,
    });

    expect(graphicsService.setAnimationPlaybackMode).not.toHaveBeenCalled();
    expect(graphicsService.render).not.toHaveBeenCalled();
    expect(store.stopPreviewPlayback).not.toHaveBeenCalled();
    expect(store.setPreviewPlaybackMode).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("saves preview data without capturing a thumbnail", async () => {
    const previewData = {
      background: {
        imageId: "image-bg",
      },
      outgoing: {
        imageId: "image-out",
        transformId: "transform-out",
      },
      incoming: {
        imageId: "image-in",
      },
    };
    const store = {
      selectAutosaveInFlight: vi.fn(() => false),
      selectAutosavePersistedVersion: vi.fn(() => 1),
      selectAutosaveVersion: vi.fn(() => 1),
      selectEditItemId: vi.fn(() => "animation-1"),
      selectPreviewPlayheadVisible: vi.fn(() => false),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      selectPreviewPlaybackMode: vi.fn(() => "auto"),
      selectPreviewPreparedVersion: vi.fn(() => undefined),
      selectPreviewRenderVersion: vi.fn(() => 1),
      setPreviewPlaybackMode: vi.fn(),
      markPreviewPrepared: vi.fn(),
      selectAnimationResetState: vi.fn(() => ({
        elements: [],
        animations: [],
      })),
      selectAnimationRenderStateWithAnimations: vi.fn(() => ({
        elements: [],
        animations: [],
      })),
      selectPreviewData: vi.fn(() => previewData),
      setItems: vi.fn(),
    };
    const projectService = {
      storeFile: vi.fn(),
      updateAnimation: vi.fn(async () => ({ valid: true })),
      getRepositoryState: vi.fn(() => ({
        animations: {
          items: {},
          tree: [],
        },
      })),
    };
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const graphicsService = {
      extractBase64: vi.fn(async () => "data:image/jpeg;base64,SGVsbG8="),
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    await handleSavePreviewClick({
      appService,
      projectService,
      render,
      store,
    });

    expect(projectService.storeFile).not.toHaveBeenCalled();
    expect(graphicsService.render).not.toHaveBeenCalled();
    expect(graphicsService.extractBase64).not.toHaveBeenCalled();
    expect(graphicsService.setAnimationPlaybackMode).not.toHaveBeenCalled();
    expect(graphicsService.setAnimationTime).not.toHaveBeenCalled();
    expect(projectService.updateAnimation).toHaveBeenCalledWith({
      animationId: "animation-1",
      data: {
        preview: previewData,
      },
    });
    expect(appService.showToast).toHaveBeenCalledWith({
      message: "Animation preview saved.",
    });
    expect(render).toHaveBeenCalled();
  });
});
