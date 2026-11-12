// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const renderer = vi.hoisted(() => ({
  destroy: vi.fn(),
  extractBase64: vi.fn(async () => "data:image/png;base64,cG5n"),
  init: vi.fn(async () => {}),
  render: vi.fn(),
  updatedBackgroundColor: vi.fn(),
}));
const createRouteGraphics = vi.hoisted(() => vi.fn(() => renderer));
const createGraphicsService = vi.hoisted(() => vi.fn());
const startCanvasVideoRecording = vi.hoisted(() => vi.fn());

vi.mock("route-graphics", () => ({
  default: createRouteGraphics,
  textPlugin: {},
}));
vi.mock("../../src/deps/services/graphicsService.js", () => ({
  createGraphicsService,
}));
vi.mock("../../src/deps/clients/canvasVideoRecorder.js", () => ({
  startCanvasVideoRecording,
}));

import {
  createLayoutPreviewRenderer,
  renderAnimationPreviewVideos,
  renderAnimationThumbnailVideo,
  renderFontPreviewImage,
  renderFontPreviewImages,
  renderParticlePreviewVideos,
  renderTextStylePreviewImages,
} from "../../src/deps/clients/web/assetPackagePreviews.js";
import { isRendererStartError } from "../../src/internal/rendererStartError.js";

describe("asset package preview client", () => {
  it("reuses its text renderer without triggering Route Graphics cleanup", async () => {
    const addFont = vi.fn();
    const deleteFont = vi.fn();
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { add: addFont, delete: deleteFont },
    });
    vi.stubGlobal(
      "FontFace",
      class {
        async load() {
          return this;
        }
      },
    );
    Object.defineProperties(URL, {
      createObjectURL: {
        configurable: true,
        value: vi.fn(() => "blob:font"),
      },
      revokeObjectURL: {
        configurable: true,
        value: vi.fn(),
      },
    });
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({
        backgroundColor: "oklch(0.145 0 0)",
        color: "oklch(0.985 0 0)",
      })),
    );
    const sourceImage = {
      width: 1920,
      height: 1080,
      close: vi.fn(),
    };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => sourceImage),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      function (callback, mimeType) {
        callback(
          new Blob([`${this.width}x${this.height}`], { type: mimeType }),
        );
      },
    );
    const options = {
      font: {
        fileId: "file-font",
        defaultWeight: 400,
      },
      fontAsset: {
        fileId: "file-font",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "font/woff2",
      },
    };

    const first = await renderFontPreviewImage(options);
    const second = await renderFontPreviewImage(options);

    expect(first.type).toBe("image/png");
    expect(second.type).toBe("image/png");
    expect(createRouteGraphics).toHaveBeenCalledOnce();
    expect(renderer.init).toHaveBeenCalledOnce();
    expect(renderer.init).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1920,
        height: 1080,
        backgroundColor: "#0a0a0a",
      }),
    );
    expect(renderer.render.mock.calls[0][0].elements[0].textStyle.fill).toBe(
      "#fafafa",
    );
    expect(renderer.updatedBackgroundColor).toHaveBeenCalledOnce();
    expect(renderer.destroy).not.toHaveBeenCalled();
    expect(addFont).toHaveBeenCalledTimes(2);
    expect(deleteFont).toHaveBeenCalledTimes(2);
  });

  it("renders a full font glyph image and keeps Aa as its thumbnail", async () => {
    const result = await renderFontPreviewImages({
      font: {
        fileId: "file-font",
        defaultWeight: 400,
      },
      fontAsset: {
        fileId: "file-font",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "font/woff2",
      },
    });

    expect(result.previewBlob.type).toBe("image/png");
    expect(result.thumbnailBlob.type).toBe("image/png");
    const [glyphPreview, thumbnailPreview] = renderer.render.mock.calls
      .slice(-2)
      .map(([state]) => state.elements[0]);
    expect(glyphPreview.content).toContain("ABCDEFGHIJKLMNOPQRST");
    expect(glyphPreview.content).toContain("\\|`~");
    expect(glyphPreview.textStyle.fontSize).toBe(96);
    expect(thumbnailPreview.content).toBe("Aa");
  });

  it("renders full-size and short text-style preview images", async () => {
    const sourceImage = {
      width: 1920,
      height: 1080,
      close: vi.fn(),
    };
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => sourceImage),
    );
    const drawImage = vi.fn();
    const outputSizes = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      function (callback, mimeType) {
        outputSizes.push([this.width, this.height]);
        callback(new Blob(["cropped"], { type: mimeType }));
      },
    );

    const previews = await renderTextStylePreviewImages({
      textStyle: { name: "Body", fontSize: 24 },
      fontAssets: [],
      fontFamilies: ["sans-serif"],
      color: "#112233",
    });

    expect(previews.previewBlob.type).toBe("image/png");
    expect(previews.thumbnailBlob.type).toBe("image/png");
    expect(outputSizes).toEqual([
      [960, 270],
      [427, 120],
    ]);
    expect(drawImage).toHaveBeenNthCalledWith(
      1,
      sourceImage,
      0,
      0,
      960,
      270,
      0,
      0,
      960,
      270,
    );
    expect(drawImage).toHaveBeenNthCalledWith(
      2,
      sourceImage,
      0,
      0,
      427,
      120,
      0,
      0,
      427,
      120,
    );
    expect(sourceImage.close).toHaveBeenCalledTimes(2);
  });

  it("records animation previews through one shared graphics context", async () => {
    const stops = [
      vi.fn(async () => new Blob(["fade"], { type: "video/webm" })),
      vi.fn(async () => new Blob(["slide"], { type: "video/webm" })),
      vi.fn(async () => new Blob(["static"], { type: "video/webm" })),
    ];
    const thumbnailBlobs = [
      new Blob(["fade-thumbnail"], { type: "video/webm" }),
      new Blob(["slide-thumbnail"], { type: "video/webm" }),
      new Blob(["static-thumbnail"], { type: "video/webm" }),
    ];
    const renderThumbnailVideo = vi
      .fn()
      .mockResolvedValueOnce(thumbnailBlobs[0])
      .mockResolvedValueOnce(thumbnailBlobs[1])
      .mockResolvedValueOnce(thumbnailBlobs[2]);
    const graphicsService = {
      destroy: vi.fn(async () => {}),
      init: vi.fn(async () => {}),
      loadAssets: vi.fn(async () => {}),
      render: vi.fn(async () => {}),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
      startCanvasVideoRecording: vi
        .fn()
        .mockImplementationOnce(() => ({ stop: stops[0] }))
        .mockImplementationOnce(() => ({ stop: stops[1] }))
        .mockImplementationOnce(() => ({ stop: stops[2] })),
    };
    createGraphicsService.mockResolvedValue(graphicsService);

    const previews = await renderAnimationPreviewVideos({
      animations: [
        {
          animationId: "animation.fade",
          animation: {
            id: "animation.fade",
            type: "animation",
            animation: {
              type: "update",
              tween: {
                alpha: {
                  initialValue: 0,
                  keyframes: [{ duration: 1, value: 1 }],
                },
              },
            },
          },
          imageAssets: [],
        },
        {
          animationId: "animation.slide",
          animation: {
            id: "animation.slide",
            type: "animation",
            animation: {
              type: "update",
              tween: {
                x: {
                  initialValue: 0,
                  keyframes: [{ duration: 1, value: 10 }],
                },
              },
            },
          },
          imageAssets: [],
        },
        {
          animationId: "animation.static",
          animation: {
            id: "animation.static",
            type: "animation",
            name: "Static",
            animation: {
              type: "update",
              tween: {},
            },
          },
          imageAssets: [],
        },
      ],
      imagesData: { items: {}, tree: [] },
      projectResolution: { width: 320, height: 180 },
      renderThumbnailVideo,
    });

    expect(previews).toEqual([
      {
        animationId: "animation.fade",
        previewBlob: expect.any(Blob),
        thumbnailBlob: expect.any(Blob),
      },
      {
        animationId: "animation.slide",
        previewBlob: expect.any(Blob),
        thumbnailBlob: expect.any(Blob),
      },
      {
        animationId: "animation.static",
        previewBlob: expect.any(Blob),
        thumbnailBlob: expect.any(Blob),
      },
    ]);
    expect(createGraphicsService).toHaveBeenCalledOnce();
    expect(graphicsService.init).toHaveBeenCalledWith({
      canvas: expect.any(HTMLDivElement),
      width: 320,
      height: 180,
    });
    expect(graphicsService.init).toHaveBeenCalledOnce();
    expect(graphicsService.render).toHaveBeenCalledTimes(6);
    for (const [renderState] of graphicsService.render.mock.calls) {
      expect(renderState.elements[0]).toMatchObject({
        type: "rect",
        fill: "#000000",
      });
    }
    expect(graphicsService.startCanvasVideoRecording).toHaveBeenCalledTimes(3);
    expect(renderThumbnailVideo).toHaveBeenCalledTimes(3);
    expect(previews[0].thumbnailBlob).toBe(thumbnailBlobs[0]);
    expect(previews[1].thumbnailBlob).toBe(thumbnailBlobs[1]);
    expect(previews[2].thumbnailBlob).toBe(thumbnailBlobs[2]);
    expect(graphicsService.startCanvasVideoRecording).toHaveBeenNthCalledWith(
      1,
      { frameRate: 60 },
    );
    expect(graphicsService.startCanvasVideoRecording).toHaveBeenNthCalledWith(
      2,
      { frameRate: 60 },
    );
    expect(graphicsService.startCanvasVideoRecording).toHaveBeenNthCalledWith(
      3,
      { frameRate: 60 },
    );
    expect(graphicsService.setAnimationTime).toHaveBeenLastCalledWith(1000);
    expect(stops[0]).toHaveBeenCalledOnce();
    expect(stops[1]).toHaveBeenCalledOnce();
    expect(stops[2]).toHaveBeenCalledOnce();
    expect(graphicsService.destroy).toHaveBeenCalledOnce();
  });

  it("retries an animation after an empty canvas recording", async () => {
    const emptyRecordingStop = vi.fn(async () => {
      throw new Error("Canvas video recording is empty.");
    });
    const successfulRecordingStop = vi.fn(
      async () => new Blob(["slide"], { type: "video/webm" }),
    );
    const graphicsService = {
      destroy: vi.fn(async () => {}),
      init: vi.fn(async () => {}),
      loadAssets: vi.fn(async () => {}),
      render: vi.fn(async () => {}),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
      startCanvasVideoRecording: vi
        .fn()
        .mockImplementationOnce(() => ({ stop: emptyRecordingStop }))
        .mockImplementationOnce(() => ({ stop: successfulRecordingStop })),
    };
    createGraphicsService.mockResolvedValueOnce(graphicsService);
    const renderThumbnailVideo = vi.fn(async () => {
      return new Blob(["thumbnail"], { type: "video/webm" });
    });

    const previews = await renderAnimationPreviewVideos({
      animations: [
        {
          animationId: "animation.slide",
          animation: {
            id: "animation.slide",
            type: "animation",
            name: "Slide 1s",
            animation: {
              type: "update",
              tween: {
                x: {
                  initialValue: 0,
                  keyframes: [{ duration: 1, value: 10 }],
                },
              },
            },
          },
          imageAssets: [],
        },
      ],
      imagesData: { items: {}, tree: [] },
      projectResolution: { width: 320, height: 180 },
      renderThumbnailVideo,
    });

    expect(previews).toEqual([
      {
        animationId: "animation.slide",
        previewBlob: expect.any(Blob),
        thumbnailBlob: expect.any(Blob),
      },
    ]);
    expect(graphicsService.startCanvasVideoRecording).toHaveBeenCalledTimes(2);
    expect(renderThumbnailVideo).toHaveBeenCalledOnce();
    expect(emptyRecordingStop).toHaveBeenCalledOnce();
    expect(successfulRecordingStop).toHaveBeenCalledOnce();
    expect(graphicsService.destroy).toHaveBeenCalledOnce();
  });

  it("derives an animation thumbnail from its completed full preview video", async () => {
    const listeners = new Map();
    let nextFrameCallback;
    const video = {
      readyState: 2,
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 1,
      ended: false,
      muted: false,
      playsInline: false,
      preload: "",
      src: "",
      addEventListener: vi.fn((type, listener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn(),
      requestVideoFrameCallback: vi.fn((callback) => {
        nextFrameCallback = callback;
        return 1;
      }),
      cancelVideoFrameCallback: vi.fn(),
      load: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(async () => {
        nextFrameCallback();
        video.ended = true;
        listeners.get("ended")();
      }),
      removeAttribute: vi.fn(),
      remove: vi.fn(),
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "video") {
        return video;
      }
      return originalCreateElement(tagName);
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    });
    const derivedThumbnail = new Blob(["derived-thumbnail"], {
      type: "video/webm",
    });
    const thumbnailStop = vi.fn(async () => derivedThumbnail);
    startCanvasVideoRecording.mockReturnValueOnce({ stop: thumbnailStop });
    Object.defineProperties(URL, {
      createObjectURL: {
        configurable: true,
        value: vi.fn(() => "blob:full-animation-preview"),
      },
      revokeObjectURL: {
        configurable: true,
        value: vi.fn(),
      },
    });

    const thumbnailBlob = await renderAnimationThumbnailVideo({
      previewBlob: new Blob(["full-preview"], { type: "video/webm" }),
    });

    expect(thumbnailBlob).toBe(derivedThumbnail);
    expect(startCanvasVideoRecording).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ width: 640, height: 360 }),
      frameRate: 60,
    });
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    expect(video.play).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:full-animation-preview",
    );
  });
});

describe("particle preview videos", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const running = { mode: "continuous", rate: 10 };
  const burst = {
    mode: "burst",
    burstCount: 20,
    particleLifetime: { min: 1, max: 2 },
  };

  // Records the particles of `emissions` in order. `frames.lit` is whether
  // the scene shows a particle.
  const record = (emissions, { failingInitIndex } = {}) => {
    vi.useFakeTimers();
    const frames = { lit: true };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: () => ({
        data: new Uint8ClampedArray([
          0,
          0,
          0,
          255,
          frames.lit ? 200 : 0,
          0,
          0,
          255,
        ]),
      }),
    });
    const services = [];
    const events = [];
    createGraphicsService.mockReset();
    createGraphicsService.mockImplementation(async () => {
      const index = services.length;
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = 1280;
      sourceCanvas.height = 720;
      const blob = new Blob([`full-${index}`], { type: "video/webm" });
      const service = {
        blob,
        destroy: vi.fn(async () => {
          events.push(`destroy ${index}`);
        }),
        getCanvas: () => sourceCanvas,
        init: vi.fn(async () => {
          if (index === failingInitIndex) {
            throw new Error("no context");
          }
        }),
        loadAssets: vi.fn(async () => {}),
        render: vi.fn(async () => {
          events.push(`render ${index}`);
        }),
        stop: vi.fn(async () => {
          events.push(`stop ${index}`);
          return blob;
        }),
        startCanvasVideoRecording: vi.fn(() => {
          events.push(`record ${index}`);
          return { stop: service.stop };
        }),
      };
      services.push(service);
      return service;
    });
    const thumbnailBlob = new Blob(["thumbnail"], { type: "video/webm" });
    startCanvasVideoRecording.mockReset();
    startCanvasVideoRecording.mockReturnValue({
      stop: vi.fn(async () => thumbnailBlob),
    });
    const previews = renderParticlePreviewVideos({
      particles: emissions.map((emission, index) => ({
        particleId: `particle-${index}`,
        particle: {
          type: "particle",
          name: `Particle ${index}`,
          width: 1280,
          height: 720,
          modules: { emission, appearance: { texture: "circle" } },
        },
        imageAssets: [],
      })),
      imageItems: {},
    });
    previews.catch(() => undefined);
    return { events, frames, previews, services, thumbnailBlob };
  };

  it("lets a running effect fill out for 3s, then records 5s of it", async () => {
    const { previews, services, thumbnailBlob } = record([running]);

    await vi.advanceTimersByTimeAsync(2900);
    expect(services[0].render).toHaveBeenCalledOnce();
    expect(services[0].startCanvasVideoRecording).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(services[0].startCanvasVideoRecording).toHaveBeenCalledWith({
      frameRate: 60,
    });
    expect(startCanvasVideoRecording).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(4800);
    expect(services[0].stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    expect(await previews).toEqual([
      {
        particleId: "particle-0",
        previewBlob: services[0].blob,
        thumbnailBlob,
      },
    ]);
    expect(services[0].stop).toHaveBeenCalledOnce();
    expect(services[0].destroy).toHaveBeenCalledOnce();
  });

  it("records a burst from its start until its last particle is gone", async () => {
    const { previews, services } = record([burst]);

    await vi.advanceTimersByTimeAsync(100);
    expect(services[0].startCanvasVideoRecording).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1800);
    expect(services[0].stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await previews;
    expect(services[0].stop).toHaveBeenCalledOnce();
    expect(services[0].destroy).toHaveBeenCalledOnce();
  });

  it("stops a burst's video once its particles have left the scene", async () => {
    const { frames, previews, services } = record([
      { mode: "burst", burstCount: 20, particleLifetime: 5 },
    ]);

    await vi.advanceTimersByTimeAsync(1500);
    expect(services[0].stop).not.toHaveBeenCalled();

    frames.lit = false;
    await vi.advanceTimersByTimeAsync(600);
    await previews;
    expect(services[0].stop).toHaveBeenCalledOnce();
  });

  it("keeps recording a burst that has not shown a particle yet, and for its first second", async () => {
    const { frames, previews, services } = record([
      { mode: "burst", burstCount: 20, particleLifetime: 3 },
    ]);
    frames.lit = false;

    await vi.advanceTimersByTimeAsync(2000);
    expect(services[0].stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1200);
    await previews;
    expect(services[0].stop).toHaveBeenCalledOnce();

    const second = record([
      { mode: "burst", burstCount: 20, particleLifetime: 3 },
    ]);
    await vi.advanceTimersByTimeAsync(200);
    second.frames.lit = false;
    await vi.advanceTimersByTimeAsync(700);
    expect(second.services[0].stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await second.previews;
    expect(second.services[0].stop).toHaveBeenCalledOnce();
  });

  it("does not stop a running effect whose scene is empty", async () => {
    const { frames, previews, services } = record([running]);
    await vi.advanceTimersByTimeAsync(3500);
    frames.lit = false;

    await vi.advanceTimersByTimeAsync(4000);
    expect(services[0].stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    await previews;
    expect(services[0].stop).toHaveBeenCalledOnce();
  });

  it("fills out the next running effect while one is recorded, and records one at a time", async () => {
    const { events, previews, services } = record([running, running, burst]);

    await vi.advanceTimersByTimeAsync(3100);
    expect(events).toEqual(["render 0", "render 1", "record 0"]);

    // The second effect has run for 8s by now, so it is recorded at once.
    await vi.advanceTimersByTimeAsync(5000);
    expect(events).toEqual([
      "render 0",
      "render 1",
      "record 0",
      "stop 0",
      "destroy 0",
      "record 1",
    ]);
    expect(services).toHaveLength(3);
    expect(services[2].render).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5100);
    expect(events.slice(6)).toEqual([
      "stop 1",
      "destroy 1",
      "render 2",
      "record 2",
    ]);

    await vi.advanceTimersByTimeAsync(2100);
    expect((await previews).map(({ particleId }) => particleId)).toEqual([
      "particle-0",
      "particle-1",
      "particle-2",
    ]);
    expect(events.slice(10)).toEqual(["stop 2", "destroy 2"]);
  });

  it("frees the next particle's context when a recording fails", async () => {
    const { previews, services } = record([running, running]);
    await vi.advanceTimersByTimeAsync(3100);
    services[0].stop.mockRejectedValueOnce(new Error("encoder failed"));

    await vi.advanceTimersByTimeAsync(5100);
    await expect(previews).rejects.toThrow(
      "Could not generate preview for particle 'Particle 0' (particle-0): encoder failed",
    );
    expect(services[0].destroy).toHaveBeenCalledOnce();
    expect(services[1].destroy).toHaveBeenCalledOnce();
  });

  it("names the particle whose context cannot start", async () => {
    const { previews, services } = record([running, running], {
      failingInitIndex: 1,
    });

    await vi.advanceTimersByTimeAsync(8200);
    await expect(previews).rejects.toThrow(
      "Could not generate preview for particle 'Particle 1' (particle-1): no context",
    );
    expect(services[0].stop).toHaveBeenCalledOnce();
    expect(services[0].destroy).toHaveBeenCalledOnce();
    expect(services[1].destroy).toHaveBeenCalledOnce();
  });
});

describe("layout preview renderer", () => {
  // The frame's pixels, which the renderer encodes as a PNG.
  const createFrame = () => ({
    toBlob: vi.fn((callback, mimeType) =>
      callback(new Blob(["png"], { type: mimeType })),
    ),
  });
  const createGraphicsServiceMock = () => ({
    destroy: vi.fn(async () => {}),
    extractBase64: vi.fn(async () => "data:image/png;base64,cG5n"),
    extractCanvas: vi.fn(async () => createFrame()),
    init: vi.fn(async () => {}),
    loadAssets: vi.fn(async () => {}),
    render: vi.fn(async () => {}),
  });
  const createSource = (overrides = {}) => ({
    width: 1280,
    height: 720,
    renderState: {
      elements: [
        { id: "art", type: "sprite", src: "file-art", x: 0, y: 0 },
        {
          id: "title",
          type: "text",
          content: "Project One",
          textStyle: { fontFamily: "file-font" },
        },
      ],
      animations: [],
    },
    assets: {
      "file-art": { url: "project-file://file-art", type: "image/png" },
      "file-font": {
        url: "project-file://file-font",
        type: "font/woff2",
        fontWeightDescriptor: "600",
      },
    },
    ...overrides,
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws a layout at its resolution and returns the full-size PNG of the frame", async () => {
    const createObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    const graphicsService = createGraphicsServiceMock();
    const frame = createFrame();
    graphicsService.extractCanvas.mockResolvedValueOnce(frame);
    createGraphicsService.mockReset();
    createGraphicsService.mockResolvedValueOnce(graphicsService);
    const renderer = createLayoutPreviewRenderer();

    const blob = await renderer.render(createSource());

    expect(blob.type).toBe("image/png");
    expect(blob.size).toBe(3);
    expect(graphicsService.init).toHaveBeenCalledWith({
      canvas: expect.any(HTMLDivElement),
      width: 1280,
      height: 720,
    });
    // The frame is encoded as it is, not scaled and not through base64.
    expect(graphicsService.extractCanvas).toHaveBeenCalledOnce();
    expect(frame.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      "image/png",
    );
    expect(graphicsService.extractBase64).not.toHaveBeenCalled();
    // The files load from the URLs given, under keys of the renderer's own,
    // and the state is drawn through them, fonts included.
    const [loadedAssets] = graphicsService.loadAssets.mock.calls[0];
    const artKey = Object.keys(loadedAssets).find((key) =>
      key.endsWith("-file-art"),
    );
    const fontKey = Object.keys(loadedAssets).find((key) =>
      key.endsWith("-file-font"),
    );
    expect(artKey).toMatch(/^layout-preview-\d+-file-art$/);
    expect(loadedAssets).toEqual({
      [artKey]: { url: "project-file://file-art", type: "image/png" },
      [fontKey]: {
        url: "project-file://file-font",
        type: "font/woff2",
        fontWeightDescriptor: "600",
      },
    });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(graphicsService.render).toHaveBeenCalledTimes(2);
    expect(graphicsService.render).toHaveBeenNthCalledWith(1, {
      elements: [],
      animations: [],
    });
    const [drawnState] = graphicsService.render.mock.calls[1];
    expect(drawnState.animations).toEqual([]);
    expect(drawnState.elements[0]).toMatchObject({ id: "art", src: artKey });
    expect(drawnState.elements[1].textStyle.fontFamily).toBe(fontKey);
    expect(graphicsService.destroy).not.toHaveBeenCalled();

    await renderer.destroy();
    expect(graphicsService.destroy).toHaveBeenCalledOnce();
  });

  it("waits for a layout's effects to run before drawing it", async () => {
    const graphicsService = createGraphicsServiceMock();
    createGraphicsService.mockReset();
    createGraphicsService.mockResolvedValueOnce(graphicsService);
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const renderer = createLayoutPreviewRenderer();

    await renderer.render(createSource({ settleMs: 30 }));

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 30);
    await renderer.destroy();
  });

  it("shares one graphics context among layouts, and makes a new one after a few", async () => {
    const graphicsServices = [
      createGraphicsServiceMock(),
      createGraphicsServiceMock(),
    ];
    createGraphicsService.mockReset();
    createGraphicsService
      .mockResolvedValueOnce(graphicsServices[0])
      .mockResolvedValueOnce(graphicsServices[1]);
    const renderer = createLayoutPreviewRenderer();

    for (let drawing = 0; drawing < 6; drawing += 1) {
      await renderer.render(createSource());
    }

    // Files already loaded on the context are not loaded again.
    expect(createGraphicsService).toHaveBeenCalledOnce();
    expect(graphicsServices[0].loadAssets).toHaveBeenCalledOnce();
    expect(graphicsServices[0].destroy).not.toHaveBeenCalled();

    await renderer.render(createSource());

    expect(createGraphicsService).toHaveBeenCalledTimes(2);
    expect(graphicsServices[0].destroy).toHaveBeenCalledOnce();
    expect(graphicsServices[1].loadAssets).toHaveBeenCalledOnce();
    expect(
      Object.keys(graphicsServices[1].loadAssets.mock.calls[0][0]),
    ).not.toEqual(Object.keys(graphicsServices[0].loadAssets.mock.calls[0][0]));

    await renderer.destroy();
    expect(graphicsServices[1].destroy).toHaveBeenCalledOnce();
  });

  it("frees a context whose layout failed, and draws the next layout on a new one", async () => {
    const graphicsServices = [
      createGraphicsServiceMock(),
      createGraphicsServiceMock(),
    ];
    graphicsServices[0].render
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("Canvas lost"));
    createGraphicsService.mockReset();
    createGraphicsService
      .mockResolvedValueOnce(graphicsServices[0])
      .mockResolvedValueOnce(graphicsServices[1]);
    const renderer = createLayoutPreviewRenderer();

    const failure = await renderer
      .render(createSource())
      .catch((error) => error);

    expect(failure.message).toBe("Canvas lost");
    expect(isRendererStartError(failure)).toBe(false);
    expect(graphicsServices[0].destroy).toHaveBeenCalledOnce();

    const blob = await renderer.render(createSource());

    expect(blob.type).toBe("image/png");
    expect(createGraphicsService).toHaveBeenCalledTimes(2);
    await renderer.destroy();
    expect(graphicsServices[1].destroy).toHaveBeenCalledOnce();
  });

  it("fails a layout whose frame cannot be encoded, as that layout's own failure", async () => {
    const graphicsService = createGraphicsServiceMock();
    graphicsService.extractCanvas.mockResolvedValueOnce({
      toBlob: (callback) => callback(undefined),
    });
    createGraphicsService.mockReset();
    createGraphicsService.mockResolvedValueOnce(graphicsService);
    const renderer = createLayoutPreviewRenderer();

    const failure = await renderer
      .render(createSource())
      .catch((error) => error);

    expect(failure.message).toBe("Could not encode the preview image.");
    expect(isRendererStartError(failure)).toBe(false);
    expect(graphicsService.destroy).toHaveBeenCalledOnce();
  });

  it("reports a graphics service that cannot be made as a start failure, and tries again for the next layout", async () => {
    const cause = new Error("No WebGL");
    const graphicsService = createGraphicsServiceMock();
    createGraphicsService.mockReset();
    createGraphicsService
      .mockRejectedValueOnce(cause)
      .mockResolvedValueOnce(graphicsService);
    const renderer = createLayoutPreviewRenderer();

    const failure = await renderer
      .render(createSource())
      .catch((error) => error);

    expect(isRendererStartError(failure)).toBe(true);
    expect(failure.cause).toBe(cause);
    expect(graphicsService.init).not.toHaveBeenCalled();

    // Whether to try again is the caller's choice.
    const blob = await renderer.render(createSource());
    expect(blob.type).toBe("image/png");
    await renderer.destroy();
  });

  it("reports a graphics service that cannot start as a start failure, and frees it", async () => {
    const cause = new Error("Context lost");
    const graphicsService = createGraphicsServiceMock();
    graphicsService.init.mockRejectedValueOnce(cause);
    createGraphicsService.mockReset();
    createGraphicsService.mockResolvedValueOnce(graphicsService);
    const renderer = createLayoutPreviewRenderer();

    const failure = await renderer
      .render(createSource())
      .catch((error) => error);

    expect(isRendererStartError(failure)).toBe(true);
    expect(failure.cause).toBe(cause);
    expect(graphicsService.destroy).toHaveBeenCalledOnce();
    expect(graphicsService.render).not.toHaveBeenCalled();
  });

  it("reports a failure making the context that replaces a used one as a start failure", async () => {
    const graphicsService = createGraphicsServiceMock();
    createGraphicsService.mockReset();
    createGraphicsService
      .mockResolvedValueOnce(graphicsService)
      .mockRejectedValueOnce(new Error("Too many contexts"));
    const renderer = createLayoutPreviewRenderer();
    for (let drawing = 0; drawing < 6; drawing += 1) {
      await renderer.render(createSource());
    }

    const failure = await renderer
      .render(createSource())
      .catch((error) => error);

    expect(isRendererStartError(failure)).toBe(true);
    expect(graphicsService.destroy).toHaveBeenCalledOnce();
  });

  it("rejects destroy when the context cannot be freed", async () => {
    const graphicsService = createGraphicsServiceMock();
    graphicsService.destroy.mockRejectedValueOnce(new Error("Destroy failed"));
    createGraphicsService.mockReset();
    createGraphicsService.mockResolvedValueOnce(graphicsService);
    const renderer = createLayoutPreviewRenderer();
    await renderer.render(createSource());

    await expect(renderer.destroy()).rejects.toThrow("Destroy failed");
    // The failed context is let go of, so freeing again does nothing.
    await renderer.destroy();
    expect(graphicsService.destroy).toHaveBeenCalledOnce();
  });
});
