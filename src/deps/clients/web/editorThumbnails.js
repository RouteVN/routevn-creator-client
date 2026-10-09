import { captureGraphicsThumbnailImage } from "../../../internal/runtime/graphicsEngineRuntime.js";
import { createGraphicsService } from "../../services/graphicsService.js";

const waitForPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

// Draws `renderState` on a renderer of its own, off screen, and returns its
// thumbnail as a JPEG data URL, at most 400 by 225, scaled straight from the
// frame's pixels. `imageAssets` maps each file id the state draws to
// `{ url, type }`. The renderer is freed before this returns, so it runs
// alongside the page's renderer only while drawing.
export const renderThumbnailImage = async ({
  width,
  height,
  renderState,
  imageAssets,
}) => {
  const host = document.createElement("div");
  const graphicsService = await createGraphicsService();
  try {
    await graphicsService.init({ canvas: host, width, height });
    if (Object.keys(imageAssets).length > 0) {
      await graphicsService.loadAssets(imageAssets);
    }
    await graphicsService.render(renderState);
    await waitForPaint();
    const thumbnailImage = await captureGraphicsThumbnailImage(graphicsService);
    if (!thumbnailImage) {
      throw new Error("The canvas returned no thumbnail image.");
    }
    return thumbnailImage;
  } finally {
    await graphicsService.destroy();
    host.remove();
  }
};
