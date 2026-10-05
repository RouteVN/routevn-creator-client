import { dataUrlToBlob } from "../dataUrl.js";
import {
  captureCanvasImage,
  captureCanvasThumbnailImage,
} from "../runtime/graphicsEngineRuntime.js";

const waitForPreviewPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

// Draws `renderState`, an editor's canvas without its selection outline, and
// captures it as a full-size preview image and a thumbnail image, or only the
// thumbnail with `thumbnailOnly`. Throws when the canvas cannot be captured.
export const captureEditorPreviewImages = async ({
  graphicsService,
  canvas,
  renderState,
  thumbnailOnly = false,
}) => {
  await graphicsService.render(renderState);
  await waitForPreviewPaint();

  const images = {};
  if (!thumbnailOnly) {
    images.previewImage = await captureCanvasImage(graphicsService, canvas);
  }
  images.thumbnailImage = await captureCanvasThumbnailImage(
    graphicsService,
    canvas,
  );
  if ((!thumbnailOnly && !images.previewImage) || !images.thumbnailImage) {
    throw new Error("The canvas returned no preview image.");
  }

  return images;
};

// Stores the captured images as project files: the preview image, when there
// is one, then the thumbnail.
export const storeEditorPreviewFiles = async ({
  projectService,
  previewImage,
  thumbnailImage,
}) => {
  const files = { fileRecords: [] };
  if (previewImage) {
    const previewFile = await projectService.storeFile({
      file: dataUrlToBlob(previewImage),
    });
    files.previewFileId = previewFile.fileId;
    files.fileRecords.push(...(previewFile.fileRecords ?? []));
  }

  const thumbnailFile = await projectService.storeFile({
    file: dataUrlToBlob(thumbnailImage),
  });
  files.thumbnailFileId = thumbnailFile.fileId;
  files.fileRecords.push(...(thumbnailFile.fileRecords ?? []));
  return files;
};
