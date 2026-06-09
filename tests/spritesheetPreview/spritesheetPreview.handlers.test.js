import { describe, expect, it, vi } from "vitest";
import {
  handleOnUpdate,
  handleSourceImageLoad,
} from "../../src/components/spritesheetPreview/spritesheetPreview.handlers.js";
import {
  createInitialState,
  selectImageSrc,
  selectViewData,
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
  it("exposes square corners and compact checkerboard styling", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      state,
      props: {
        br: "none",
        checkerCellSize: "4",
      },
    });

    expect(viewData.br).toBe("md");
    expect(viewData.transparencyGridStyle).toContain("border-radius: 0px");
    expect(viewData.transparencyGridStyle).toContain(
      "background-size: 8px 8px",
    );
    expect(viewData.transparencyGridStyle).toContain(
      "background-position: 0 0, 0 4px, 4px -4px, -4px 0",
    );
  });

  it("hides checkerboard styling when disabled", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      state,
      props: {
        br: "none",
        showCheckerboard: false,
      },
    });

    expect(viewData.br).toBe("md");
    expect(viewData.transparencyGridStyle).toContain("border-radius: 0px");
    expect(viewData.transparencyGridStyle).toContain(
      "background-color: transparent",
    );
    expect(viewData.transparencyGridStyle).toContain("background-image: none");
    expect(viewData.transparencyGridStyle).not.toContain("linear-gradient");
  });

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

  it("draws atlas frames referenced by frame name", () => {
    const state = createInitialState();
    const render = vi.fn();
    const drawImage = vi.fn();
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage,
    };
    const originalCanvasElement = globalThis.HTMLCanvasElement;
    const originalImageElement = globalThis.HTMLImageElement;

    class FakeCanvas {
      constructor() {
        this.width = 0;
        this.height = 0;
        this.clientWidth = 56;
        this.clientHeight = 32;
      }

      getBoundingClientRect() {
        return {
          width: 56,
          height: 32,
        };
      }

      getContext(type) {
        return type === "2d" ? context : undefined;
      }
    }

    class FakeImage {
      constructor() {
        this.complete = true;
        this.naturalWidth = 64;
        this.naturalHeight = 64;
      }
    }

    const canvas = new FakeCanvas();
    const sourceImage = new FakeImage();

    globalThis.HTMLCanvasElement = FakeCanvas;
    globalThis.HTMLImageElement = FakeImage;

    try {
      handleSourceImageLoad({
        props: {
          paused: true,
          atlas: {
            frames: {
              empty: {
                frame: {
                  x: 0,
                  y: 0,
                  w: 1,
                  h: 1,
                },
              },
              "blink-0": {
                frame: {
                  x: 10,
                  y: 20,
                  w: 30,
                  h: 40,
                },
                sourceSize: {
                  w: 30,
                  h: 40,
                },
              },
            },
          },
          animation: {
            frames: ["blink-0"],
          },
        },
        refs: {
          canvas,
          sourceImage,
        },
        render,
        store: createStoreApi(state),
      });
    } finally {
      globalThis.HTMLCanvasElement = originalCanvasElement;
      globalThis.HTMLImageElement = originalImageElement;
    }

    expect(drawImage).toHaveBeenCalledWith(
      sourceImage,
      10,
      20,
      30,
      40,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 0, 0, 4, 4);
    expect(drawImage.mock.calls[0][8]).toBeGreaterThan(20);
    expect(selectStatus({ state })).toBe("ready");
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("uses explicit checkerboard cell size when clearing the canvas", () => {
    const state = createInitialState();
    const render = vi.fn();
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const originalCanvasElement = globalThis.HTMLCanvasElement;
    const originalImageElement = globalThis.HTMLImageElement;

    class FakeCanvas {
      constructor() {
        this.width = 0;
        this.height = 0;
        this.clientWidth = 32;
        this.clientHeight = 32;
      }

      getBoundingClientRect() {
        return {
          width: 32,
          height: 32,
        };
      }

      getContext(type) {
        return type === "2d" ? context : undefined;
      }
    }

    class FakeImage {
      constructor() {
        this.complete = true;
        this.naturalWidth = 64;
        this.naturalHeight = 64;
      }
    }

    const canvas = new FakeCanvas();
    const sourceImage = new FakeImage();

    globalThis.HTMLCanvasElement = FakeCanvas;
    globalThis.HTMLImageElement = FakeImage;

    try {
      handleSourceImageLoad({
        props: {
          checkerCellSize: "4",
          paused: true,
        },
        refs: {
          canvas,
          sourceImage,
        },
        render,
        store: createStoreApi(state),
      });
    } finally {
      globalThis.HTMLCanvasElement = originalCanvasElement;
      globalThis.HTMLImageElement = originalImageElement;
    }

    expect(context.fillRect.mock.calls).toContainEqual([0, 0, 4, 4]);
  });

  it("skips checkerboard drawing when disabled", () => {
    const state = createInitialState();
    const render = vi.fn();
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    };
    const originalCanvasElement = globalThis.HTMLCanvasElement;
    const originalImageElement = globalThis.HTMLImageElement;

    class FakeCanvas {
      constructor() {
        this.width = 0;
        this.height = 0;
        this.clientWidth = 32;
        this.clientHeight = 32;
      }

      getBoundingClientRect() {
        return {
          width: 32,
          height: 32,
        };
      }

      getContext(type) {
        return type === "2d" ? context : undefined;
      }
    }

    class FakeImage {
      constructor() {
        this.complete = true;
        this.naturalWidth = 64;
        this.naturalHeight = 64;
      }
    }

    const canvas = new FakeCanvas();
    const sourceImage = new FakeImage();

    globalThis.HTMLCanvasElement = FakeCanvas;
    globalThis.HTMLImageElement = FakeImage;

    try {
      handleSourceImageLoad({
        props: {
          showCheckerboard: false,
          paused: true,
        },
        refs: {
          canvas,
          sourceImage,
        },
        render,
        store: createStoreApi(state),
      });
    } finally {
      globalThis.HTMLCanvasElement = originalCanvasElement;
      globalThis.HTMLImageElement = originalImageElement;
    }

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 32, 32);
    expect(context.fillRect).not.toHaveBeenCalled();
  });
});
