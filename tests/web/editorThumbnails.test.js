import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapRenderStateSources,
  releaseThumbnailRenderer,
  renderThumbnailImage,
} from "../../src/deps/clients/web/editorThumbnails.js";
import { captureGraphicsThumbnailImage } from "../../src/internal/runtime/graphicsEngineRuntime.js";
import { createGraphicsService } from "../../src/deps/services/graphicsService.js";

// The renderer and the canvas capture need a browser.
vi.mock("../../src/deps/services/graphicsService.js", () => ({
  createGraphicsService: vi.fn(),
}));
vi.mock(
  "../../src/internal/runtime/graphicsEngineRuntime.js",
  async (importOriginal) => ({
    ...(await importOriginal()),
    captureGraphicsThumbnailImage: vi.fn(
      async () => "data:image/jpeg;base64,dGh1bWI=",
    ),
  }),
);

const renderState = {
  id: "transform-editor",
  elements: [
    { id: "background", type: "sprite", src: "file-1" },
    {
      id: "target",
      type: "container",
      children: [
        { id: "body", type: "sprite", src: "file-2" },
        { id: "face", type: "sprite", src: "file-3" },
      ],
    },
    { id: "square", type: "rect", fill: "#a0a0a0" },
  ],
  animations: [],
};

const createGraphics = () => ({
  init: vi.fn(async () => {}),
  loadAssets: vi.fn(async () => {}),
  render: vi.fn(async () => {}),
  destroy: vi.fn(async () => {}),
});

const stubBrowser = () => {
  vi.stubGlobal("document", {
    createElement: () => ({ remove: vi.fn() }),
  });
  vi.stubGlobal("requestAnimationFrame", (callback) => callback());
};

const thumbnailImage = "data:image/jpeg;base64,dGh1bWI=";
const imageAssets = {
  "file-1": { url: "blob:file-1", type: "image/png" },
  "file-2": { url: "blob:file-2", type: "image/png" },
};
const draw = (options = {}) =>
  renderThumbnailImage({
    width: 1920,
    height: 1080,
    renderState,
    assets: imageAssets,
    ...options,
  });
const keysOf = (graphics) =>
  graphics.loadAssets.mock.calls.flatMap(([assets]) => Object.keys(assets));

afterEach(async () => {
  await releaseThumbnailRenderer();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  createGraphicsService.mockReset();
});

describe("editor thumbnails", () => {
  it("reads every file it draws through the key mapping, in any field, and leaves ids alone", () => {
    const withSlider = {
      ...renderState,
      elements: [
        ...renderState.elements,
        {
          id: "file-3",
          type: "slider",
          thumbSrc: "file-1",
          barSrc: "file-2",
          hover: { src: "file-3" },
        },
      ],
    };
    const known = new Set(["file-1", "file-2", "file-3"]);

    expect(
      mapRenderStateSources(withSlider, (fileId) =>
        known.has(fileId) ? `key:${fileId}` : fileId,
      ),
    ).toEqual({
      ...renderState,
      elements: [
        { id: "background", type: "sprite", src: "key:file-1" },
        {
          id: "target",
          type: "container",
          children: [
            { id: "body", type: "sprite", src: "key:file-2" },
            { id: "face", type: "sprite", src: "key:file-3" },
          ],
        },
        { id: "square", type: "rect", fill: "#a0a0a0" },
        {
          id: "file-3",
          type: "slider",
          thumbSrc: "key:file-1",
          barSrc: "key:file-2",
          hover: { src: "key:file-3" },
        },
      ],
    });
    // The hashed render state is left as it was.
    expect(renderState.elements[0].src).toBe("file-1");
  });

  it("loads files under its renderer's own keys, never the file ids a page uses, once per renderer", async () => {
    stubBrowser();
    const graphics = createGraphics();
    createGraphicsService.mockResolvedValue(graphics);

    await expect(draw()).resolves.toBe(thumbnailImage);
    await expect(draw()).resolves.toBe(thumbnailImage);

    // Drawings of one size share a renderer, and its files load once.
    expect(createGraphicsService).toHaveBeenCalledOnce();
    expect(graphics.init).toHaveBeenCalledOnce();
    expect(graphics.init).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1920, height: 1080 }),
    );
    expect(graphics.loadAssets).toHaveBeenCalledOnce();
    const keys = keysOf(graphics);
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(Object.keys(imageAssets)).not.toContain(key);
    }
    // Each drawing clears the last one first, then draws under the keys.
    expect(
      graphics.render.mock.calls.map(([state]) => state.elements.length),
    ).toEqual([0, 3, 0, 3]);
    const drawnSource = graphics.render.mock.calls[1][0].elements[0].src;
    expect(graphics.loadAssets.mock.calls[0][0][drawnSource]).toEqual(
      imageAssets["file-1"],
    );
    expect(captureGraphicsThumbnailImage).toHaveBeenCalledWith(graphics);

    expect(graphics.destroy).not.toHaveBeenCalled();
    await releaseThumbnailRenderer();
    expect(graphics.destroy).toHaveBeenCalledOnce();
  });

  it("makes a new renderer with keys of its own once freed, for another size, and after six drawings", async () => {
    stubBrowser();
    const made = [];
    createGraphicsService.mockImplementation(async () => {
      const graphics = createGraphics();
      made.push(graphics);
      return graphics;
    });

    await draw();
    await releaseThumbnailRenderer();
    await draw();
    expect(made).toHaveLength(2);
    expect(
      keysOf(made[0]).filter((key) => keysOf(made[1]).includes(key)),
    ).toEqual([]);

    await draw({ width: 640, height: 360 });
    expect(made).toHaveLength(3);
    expect(made[1].destroy).toHaveBeenCalledOnce();

    for (let drawing = 2; drawing <= 6; drawing += 1) {
      await draw({ width: 640, height: 360 });
    }
    expect(made).toHaveLength(3);
    await draw({ width: 640, height: 360 });
    expect(made).toHaveLength(4);
    expect(made[2].destroy).toHaveBeenCalledOnce();
  });

  it("frees a renderer whose drawing failed, and draws the next on a new one", async () => {
    stubBrowser();
    const failing = createGraphics();
    failing.render
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("render failed"));
    const next = createGraphics();
    createGraphicsService
      .mockResolvedValueOnce(failing)
      .mockResolvedValueOnce(next);

    await expect(draw()).rejects.toThrow("render failed");
    expect(failing.destroy).toHaveBeenCalledOnce();

    await expect(draw()).resolves.toBe(thumbnailImage);
    expect(next.init).toHaveBeenCalledOnce();
  });

  it("renames particle textures it loaded, at any depth, and keeps built-in ones", () => {
    const particles = {
      elements: [
        {
          id: "particle-preview",
          type: "particles",
          modules: {
            appearance: {
              texture: {
                items: [{ src: "file-1" }, { src: "circle" }],
              },
            },
          },
        },
        {
          id: "other",
          type: "particles",
          modules: { appearance: { texture: "file-2" } },
        },
      ],
      animations: [],
    };
    const known = new Map([
      ["file-1", "key:file-1"],
      ["file-2", "key:file-2"],
    ]);

    const mapped = mapRenderStateSources(
      particles,
      (fileId) => known.get(fileId) ?? fileId,
    );

    expect(mapped.elements[0].modules.appearance.texture.items).toEqual([
      { src: "key:file-1" },
      { src: "circle" },
    ]);
    expect(mapped.elements[1].modules.appearance.texture).toBe("key:file-2");
  });

  it("renames the fonts it loaded in a text style's font family, and keeps the system's", () => {
    const text = {
      elements: [
        {
          id: "title",
          type: "text",
          textStyle: { fontFamily: "file-font-1, sans-serif", fontSize: 32 },
        },
        {
          id: "line",
          type: "text-revealing",
          textStyle: { fontFamily: ["file-font-1", "serif"] },
        },
      ],
      animations: [],
    };

    const mapped = mapRenderStateSources(text, (fileId) =>
      fileId === "file-font-1" ? "key-file-font-1" : fileId,
    );

    expect(mapped.elements[0].textStyle).toEqual({
      fontFamily: "key-file-font-1,sans-serif",
      fontSize: 32,
    });
    expect(mapped.elements[1].textStyle.fontFamily).toEqual([
      "key-file-font-1",
      "serif",
    ]);
  });

  it("loads fonts under keys that are valid font family names", async () => {
    stubBrowser();
    const graphics = createGraphics();
    createGraphicsService.mockResolvedValueOnce(graphics);
    const font = {
      url: "blob:font",
      type: "font/woff2",
      fontWeightDescriptor: "600",
    };

    await renderThumbnailImage({
      width: 640,
      height: 360,
      renderState: {
        elements: [
          { id: "title", type: "text", textStyle: { fontFamily: "9font" } },
        ],
        animations: [],
      },
      assets: { "9font": font },
    });

    const [[loaded]] = graphics.loadAssets.mock.calls;
    const [key] = Object.keys(loaded);
    // A CSS identifier: it starts with a letter and has no colon.
    expect(key).toMatch(/^[a-z][a-z0-9_-]*$/i);
    expect(loaded[key]).toEqual(font);
    expect(
      graphics.render.mock.calls.at(-1)[0].elements[0].textStyle.fontFamily,
    ).toBe(key);
  });

  it("lets an effect run for its settle time before it captures", async () => {
    vi.useFakeTimers();
    try {
      stubBrowser();
      const graphics = createGraphics();
      createGraphicsService.mockResolvedValueOnce(graphics);

      const drawing = renderThumbnailImage({
        width: 640,
        height: 360,
        renderState,
        assets: {},
        settleMs: 1500,
      });
      await vi.advanceTimersByTimeAsync(1400);
      expect(captureGraphicsThumbnailImage).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      await drawing;

      expect(captureGraphicsThumbnailImage).toHaveBeenCalledOnce();
      expect(graphics.loadAssets).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
