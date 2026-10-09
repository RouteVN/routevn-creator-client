import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapRenderStateSources,
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("editor thumbnails", () => {
  it("reads every element's and child's source through the key mapping", () => {
    expect(
      mapRenderStateSources(renderState, (fileId) => `key:${fileId}`),
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
      ],
    });
    // The hashed render state is left as it was.
    expect(renderState.elements[0].src).toBe("file-1");
  });

  it("loads images under keys of each drawing's own, never the file ids a page uses, and frees its renderer", async () => {
    vi.stubGlobal("document", {
      createElement: () => ({ remove: vi.fn() }),
    });
    vi.stubGlobal("requestAnimationFrame", (callback) => callback());
    const first = createGraphics();
    const second = createGraphics();
    createGraphicsService
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const imageAssets = {
      "file-1": { url: "blob:file-1", type: "image/png" },
      "file-2": { url: "blob:file-2", type: "image/png" },
    };

    for (const graphics of [first, second]) {
      await expect(
        renderThumbnailImage({
          width: 1920,
          height: 1080,
          renderState,
          imageAssets,
        }),
      ).resolves.toBe("data:image/jpeg;base64,dGh1bWI=");
      expect(graphics.init).toHaveBeenCalledWith(
        expect.objectContaining({ width: 1920, height: 1080 }),
      );
      expect(captureGraphicsThumbnailImage).toHaveBeenCalledWith(graphics);
      expect(graphics.destroy).toHaveBeenCalledOnce();
    }

    const keysOf = (graphics) =>
      Object.keys(graphics.loadAssets.mock.calls[0][0]);
    const [firstKeys, secondKeys] = [keysOf(first), keysOf(second)];
    expect(firstKeys).toHaveLength(2);
    for (const key of [...firstKeys, ...secondKeys]) {
      expect(Object.keys(imageAssets)).not.toContain(key);
    }
    expect(firstKeys.filter((key) => secondKeys.includes(key))).toEqual([]);
    // The drawing reads the images under those keys.
    const drawnSources = first.render.mock.calls[0][0].elements[0].src;
    expect(firstKeys).toContain(drawnSources);
    expect(first.loadAssets.mock.calls[0][0][drawnSources]).toEqual(
      imageAssets["file-1"],
    );
  });
});
