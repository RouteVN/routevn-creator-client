// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

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
  renderAnimationPreviewVideos,
  renderFontPreviewImage,
  renderFontPreviewImages,
  renderTextStylePreviewImages,
} from "../../src/deps/clients/web/assetPackagePreviews.js";

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
    vi.stubGlobal("createImageBitmap", vi.fn(async () => sourceImage));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      function (callback, mimeType) {
        callback(new Blob([`${this.width}x${this.height}`], { type: mimeType }));
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
    vi.stubGlobal("createImageBitmap", vi.fn(async () => sourceImage));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      function (callback, mimeType) {
        expect(this.width).toBe(640);
        expect(this.height).toBe(180);
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
    expect(drawImage).toHaveBeenCalledWith(
      sourceImage,
      0,
      0,
      640,
      180,
      0,
      0,
      640,
      180,
    );
    expect(sourceImage.close).toHaveBeenCalledOnce();
  });

  it("records animation previews through one shared graphics context", async () => {
    const stops = [
      vi.fn(async () => new Blob(["fade"], { type: "video/webm" })),
      vi.fn(async () => new Blob(["slide"], { type: "video/webm" })),
      vi.fn(async () => new Blob(["static"], { type: "video/webm" })),
    ];
    const thumbnailStops = [
      vi.fn(async () => new Blob(["fade-thumbnail"], { type: "video/webm" })),
      vi.fn(async () => new Blob(["slide-thumbnail"], { type: "video/webm" })),
      vi.fn(async () => new Blob(["static-thumbnail"], { type: "video/webm" })),
    ];
    startCanvasVideoRecording
      .mockImplementationOnce(() => ({ stop: thumbnailStops[0] }))
      .mockImplementationOnce(() => ({ stop: thumbnailStops[1] }))
      .mockImplementationOnce(() => ({ stop: thumbnailStops[2] }));
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 320;
    sourceCanvas.height = 180;
    const thumbnailContext = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      thumbnailContext,
    );
    const graphicsService = {
      destroy: vi.fn(async () => {}),
      init: vi.fn(async () => {}),
      loadAssets: vi.fn(async () => {}),
      render: vi.fn(async () => {}),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
      getCanvas: vi.fn(() => sourceCanvas),
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
    expect(graphicsService.startCanvasVideoRecording).toHaveBeenCalledTimes(3);
    expect(startCanvasVideoRecording).toHaveBeenCalledTimes(3);
    expect(startCanvasVideoRecording).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ width: 160, height: 90 }),
      frameRate: 60,
    });
    expect(thumbnailContext.drawImage).toHaveBeenCalled();
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
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 320;
    sourceCanvas.height = 180;
    const thumbnailContext = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      thumbnailContext,
    );

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
      getCanvas: vi.fn(() => sourceCanvas),
      startCanvasVideoRecording: vi
        .fn()
        .mockImplementationOnce(() => ({ stop: emptyRecordingStop }))
        .mockImplementationOnce(() => ({ stop: successfulRecordingStop })),
    };
    createGraphicsService.mockResolvedValueOnce(graphicsService);
    startCanvasVideoRecording.mockReset();
    startCanvasVideoRecording
      .mockImplementationOnce(() => ({
        stop: vi.fn(
          async () => new Blob(["first-thumbnail"], { type: "video/webm" }),
        ),
      }))
      .mockImplementationOnce(() => ({
        stop: vi.fn(
          async () => new Blob(["second-thumbnail"], { type: "video/webm" }),
        ),
      }));

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
    });

    expect(previews).toEqual([
      {
        animationId: "animation.slide",
        previewBlob: expect.any(Blob),
        thumbnailBlob: expect.any(Blob),
      },
    ]);
    expect(graphicsService.startCanvasVideoRecording).toHaveBeenCalledTimes(2);
    expect(startCanvasVideoRecording).toHaveBeenCalledTimes(2);
    expect(emptyRecordingStop).toHaveBeenCalledOnce();
    expect(successfulRecordingStop).toHaveBeenCalledOnce();
    expect(graphicsService.destroy).toHaveBeenCalledOnce();
  });
});
