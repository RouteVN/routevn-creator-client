import {
  captureCanvasImage,
  captureCanvasThumbnailImage,
} from "../../../internal/runtime/graphicsEngineRuntime.js";

const dataUrlToBlob = async (value) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Preview image is missing");
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Preview image is not a valid data URL");
  }

  const header = value.slice(0, commaIndex);
  const body = value.slice(commaIndex + 1);
  const mimeMatch = header.match(/^data:([^;,]+)?(?:;base64)?$/);
  if (!mimeMatch) {
    throw new Error("Preview image is not a valid data URL");
  }

  const mimeType = mimeMatch[1] || "application/octet-stream";
  if (!header.includes(";base64")) {
    return new Blob([decodeURIComponent(body)], { type: mimeType });
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

const waitForPreviewPaint = () =>
  new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame !== "function") {
      resolve();
      return;
    }

    globalThis.requestAnimationFrame(() => {
      globalThis.requestAnimationFrame(resolve);
    });
  });

// Draws `renderState`, the transform without the selection outline, and
// stores it as the transform's preview and thumbnail images. Returns nothing
// when the canvas cannot be captured.
export const captureTransformPreviewFiles = async ({
  graphicsService,
  projectService,
  canvas,
  renderState,
}) => {
  try {
    graphicsService.render(renderState);
    await waitForPreviewPaint();

    const previewImage = await captureCanvasImage(graphicsService, canvas);
    const thumbnailImage = await captureCanvasThumbnailImage(
      graphicsService,
      canvas,
    );
    if (!previewImage || !thumbnailImage) {
      return undefined;
    }

    const previewFile = await projectService.storeFile({
      file: await dataUrlToBlob(previewImage),
    });
    const thumbnailFile = await projectService.storeFile({
      file: await dataUrlToBlob(thumbnailImage),
    });

    return {
      previewFileId: previewFile.fileId,
      thumbnailFileId: thumbnailFile.fileId,
      fileRecords: [
        ...(previewFile.fileRecords ?? []),
        ...(thumbnailFile.fileRecords ?? []),
      ],
    };
  } catch (error) {
    console.error("[transformEditor] Failed to capture the preview", error);
    return undefined;
  }
};
