import { dataUrlToBlob } from "../../../internal/dataUrl.js";
import {
  captureCanvasImage,
  captureCanvasThumbnailImage,
} from "../../../internal/runtime/graphicsEngineRuntime.js";

const waitForPreviewPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

// Draws `renderState`, the transform without the selection outline, and
// captures it as the transform's preview and thumbnail images. Throws when
// the canvas cannot be captured.
export const captureTransformPreviewImages = async ({
  graphicsService,
  canvas,
  renderState,
}) => {
  await graphicsService.render(renderState);
  await waitForPreviewPaint();

  const previewImage = await captureCanvasImage(graphicsService, canvas);
  const thumbnailImage = await captureCanvasThumbnailImage(
    graphicsService,
    canvas,
  );
  if (!previewImage || !thumbnailImage) {
    throw new Error("The canvas returned no preview image.");
  }

  return { previewImage, thumbnailImage };
};

// Stores the captured images as project files for the transform to use.
export const storeTransformPreviewFiles = async ({
  projectService,
  previewImage,
  thumbnailImage,
}) => {
  const previewFile = await projectService.storeFile({
    file: dataUrlToBlob(previewImage),
  });
  const thumbnailFile = await projectService.storeFile({
    file: dataUrlToBlob(thumbnailImage),
  });

  return {
    previewFileId: previewFile.fileId,
    thumbnailFileId: thumbnailFile.fileId,
    fileRecords: [
      ...(previewFile.fileRecords ?? []),
      ...(thumbnailFile.fileRecords ?? []),
    ],
  };
};
