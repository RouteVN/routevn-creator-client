import { describe, expect, it, vi } from "vitest";
import { handleTransformPreviewImageSelected } from "../../src/pages/transforms/transforms.handlers.js";

describe("transforms.handlers", () => {
  it("applies preview image selections and rerenders the route-graphics preview", async () => {
    const canvas = {};
    const backgroundImage = {
      id: "image-bg",
      type: "image",
      fileId: "file-bg",
      fileType: "image/png",
      width: 640,
      height: 360,
    };
    const store = {
      applyPreviewImageSelectorSelection: vi.fn(),
      selectDialogValues: vi.fn(() => ({
        x: "100",
        y: "120",
        scaleX: "1",
        scaleY: "1",
        rotation: "0",
        anchor: {
          anchorX: 0.5,
          anchorY: 0.5,
        },
      })),
      selectProjectResolution: vi.fn(() => ({
        width: 1920,
        height: 1080,
      })),
      selectDialogPreviewBackgroundImage: vi.fn(() => backgroundImage),
      selectDialogPreviewTargetImage: vi.fn(() => undefined),
    };
    const graphicsService = {
      attachCanvas: vi.fn(),
      loadAssets: vi.fn(),
      render: vi.fn(),
    };
    const projectService = {
      getFileContent: vi.fn(async () => ({
        url: "blob:file-bg",
        type: "image/png",
      })),
    };
    const render = vi.fn();

    await handleTransformPreviewImageSelected(
      {
        graphicsService,
        projectService,
        refs: {
          canvas,
        },
        render,
        store,
      },
      {
        _event: {
          detail: {
            imageId: "image-bg",
          },
        },
      },
    );

    expect(store.applyPreviewImageSelectorSelection).toHaveBeenCalledWith({
      imageId: "image-bg",
    });
    expect(render).toHaveBeenCalled();
    expect(graphicsService.attachCanvas).toHaveBeenCalledWith(canvas);
    expect(projectService.getFileContent).toHaveBeenCalledWith("file-bg");
    expect(graphicsService.loadAssets).toHaveBeenCalledWith({
      "file-bg": {
        url: "blob:file-bg",
        type: "image/png",
      },
    });
    expect(graphicsService.render).toHaveBeenNthCalledWith(1, {
      elements: [],
      animations: [],
      audio: [],
    });
    expect(graphicsService.render).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        elements: expect.arrayContaining([
          expect.objectContaining({
            id: "bg",
            type: "sprite",
            src: "file-bg",
          }),
        ]),
      }),
    );
  });
});
