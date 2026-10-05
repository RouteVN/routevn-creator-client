import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureCanvasThumbnailImage } from "../../src/internal/runtime/graphicsEngineRuntime.js";
import {
  captureEditorPreviewImages,
  storeEditorPreviewFiles,
} from "../../src/internal/ui/editorPreviewCapture.js";

// Capturing the canvas needs a renderer, so the capture is mocked.
vi.mock("../../src/internal/runtime/graphicsEngineRuntime.js", () => ({
  captureCanvasImage: vi.fn(async () => "data:image/png;base64,cHJldmlldw=="),
  captureCanvasThumbnailImage: vi.fn(
    async () => "data:image/png;base64,dGh1bWI=",
  ),
}));

const createGraphicsService = () => ({ render: vi.fn(async () => {}) });

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(callback, 0));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("editor preview capture", () => {
  it("draws the render state, then captures the preview and the thumbnail", async () => {
    const graphicsService = createGraphicsService();
    const renderState = { elements: [] };

    const images = await captureEditorPreviewImages({
      graphicsService,
      canvas: {},
      renderState,
    });

    expect(graphicsService.render).toHaveBeenCalledWith(renderState);
    expect(images).toEqual({
      previewImage: "data:image/png;base64,cHJldmlldw==",
      thumbnailImage: "data:image/png;base64,dGh1bWI=",
    });
  });

  it("captures only the thumbnail when asked", async () => {
    const images = await captureEditorPreviewImages({
      graphicsService: createGraphicsService(),
      canvas: {},
      renderState: { elements: [] },
      thumbnailOnly: true,
    });

    expect(images).toEqual({
      thumbnailImage: "data:image/png;base64,dGh1bWI=",
    });
  });

  it("throws when the canvas returns no image", async () => {
    captureCanvasThumbnailImage.mockResolvedValueOnce(undefined);

    await expect(
      captureEditorPreviewImages({
        graphicsService: createGraphicsService(),
        canvas: {},
        renderState: { elements: [] },
        thumbnailOnly: true,
      }),
    ).rejects.toThrow("The canvas returned no preview image.");
  });

  it("stores the preview, when there is one, and the thumbnail", async () => {
    let count = 0;
    const projectService = {
      storeFile: vi.fn(async () => {
        count += 1;
        return { fileId: `file-${count}`, fileRecords: [{ id: count }] };
      }),
    };

    expect(
      await storeEditorPreviewFiles({
        projectService,
        previewImage: "data:image/png;base64,cHJldmlldw==",
        thumbnailImage: "data:image/png;base64,dGh1bWI=",
      }),
    ).toEqual({
      previewFileId: "file-1",
      thumbnailFileId: "file-2",
      fileRecords: [{ id: 1 }, { id: 2 }],
    });
    expect(
      await storeEditorPreviewFiles({
        projectService,
        thumbnailImage: "data:image/png;base64,dGh1bWI=",
      }),
    ).toEqual({
      thumbnailFileId: "file-3",
      fileRecords: [{ id: 3 }],
    });
  });
});
