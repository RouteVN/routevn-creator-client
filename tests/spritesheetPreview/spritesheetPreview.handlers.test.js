import { describe, expect, it, vi } from "vitest";
import {
  handleOnUpdate,
  handleSourceImageLoad,
} from "../../src/components/spritesheetPreview/spritesheetPreview.handlers.js";
import {
  createInitialState,
  selectImageSrc,
  selectStatus,
  setImageSrc,
  setStatus,
} from "../../src/components/spritesheetPreview/spritesheetPreview.store.js";

const createStoreApi = (state) => ({
  clearAnimationFrameId: () => {
    state.animationFrameId = undefined;
  },
  selectAnimationFrameId: () => state.animationFrameId,
  selectImageSrc: () => selectImageSrc({ state }),
  selectOwnsImageSrc: () => state.ownsImageSrc,
  selectPlaybackStartedAt: () => state.playbackStartedAt,
  selectStatus: () => selectStatus({ state }),
  setAnimationFrameId: ({ animationFrameId }) => {
    state.animationFrameId = animationFrameId;
  },
  setImageSrc: (payload) => setImageSrc({ state }, payload),
  setPlaybackStartedAt: ({ playbackStartedAt }) => {
    state.playbackStartedAt = playbackStartedAt;
  },
  setStatus: (payload) => setStatus({ state }, payload),
});

describe("spritesheetPreview.handlers", () => {
  it("loads preview source when src is added after mount", async () => {
    const state = createInitialState();
    const render = vi.fn();

    await handleOnUpdate(
      {
        projectService: {},
        refs: {},
        render,
        store: createStoreApi(state),
      },
      {
        oldProps: {},
        newProps: {
          src: "blob:test-spritesheet",
        },
      },
    );

    expect(selectStatus({ state })).toBe("loading");
    expect(selectImageSrc({ state })).toBe("blob:test-spritesheet");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("returns to empty when preview source is cleared", async () => {
    const state = createInitialState();
    const render = vi.fn();

    setImageSrc(
      { state },
      {
        imageSrc: "blob:test-spritesheet",
        ownsImageSrc: false,
      },
    );
    setStatus(
      { state },
      {
        status: "ready",
      },
    );

    await handleOnUpdate(
      {
        projectService: {},
        refs: {},
        render,
        store: createStoreApi(state),
      },
      {
        oldProps: {
          src: "blob:test-spritesheet",
        },
        newProps: {},
      },
    );

    expect(selectStatus({ state })).toBe("empty");
    expect(selectImageSrc({ state })).toBe("");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("stops the running animation when preview becomes paused", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const cancelAnimationFrameSpy = vi.fn();
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

    globalThis.cancelAnimationFrame = cancelAnimationFrameSpy;
    state.animationFrameId = 42;
    setStatus(
      { state },
      {
        status: "ready",
      },
    );

    try {
      await handleOnUpdate(
        {
          projectService: {},
          refs: {},
          render,
          store: createStoreApi(state),
        },
        {
          oldProps: {
            paused: false,
          },
          newProps: {
            paused: true,
          },
        },
      );
    } finally {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(42);
    expect(state.animationFrameId).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("treats string true as paused", () => {
    const state = createInitialState();
    const render = vi.fn();
    const requestAnimationFrameSpy = vi.fn();
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

    globalThis.requestAnimationFrame = requestAnimationFrameSpy;

    try {
      handleSourceImageLoad({
        props: {
          paused: "true",
          animation: {
            frames: [0, 1],
          },
        },
        refs: {},
        render,
        store: createStoreApi(state),
      });
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }

    expect(selectStatus({ state })).toBe("ready");
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
