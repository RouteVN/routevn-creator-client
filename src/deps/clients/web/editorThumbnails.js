import { captureGraphicsThumbnailImage } from "../../../internal/runtime/graphicsEngineRuntime.js";
import { createGraphicsService } from "../../services/graphicsService.js";

const waitForPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

let renderCount = 0;

// The render state with each element's `src`, and its children's, read
// through `toKey`.
export const mapRenderStateSources = (renderState, toKey) => {
  const mapElement = (element) => {
    const mapped = { ...element };
    if (typeof element.src === "string") {
      mapped.src = toKey(element.src);
    }
    if (Array.isArray(element.children)) {
      mapped.children = element.children.map(mapElement);
    }
    return mapped;
  };
  return { ...renderState, elements: renderState.elements.map(mapElement) };
};

// Draws `renderState` on a renderer of its own, off screen, and returns its
// thumbnail as a JPEG data URL, at most 400 by 225, scaled straight from the
// frame's pixels. `imageAssets` maps each file id the state draws to
// `{ url, type }`. The renderer is freed before this returns.
//
// Its images load under keys of their own. Textures are cached by key for
// every renderer, and freeing a renderer unloads the keys it loaded, so a key
// shared with the page's renderer would take the page's image away, or the
// page leaving would take this one's.
export const renderThumbnailImage = async ({
  width,
  height,
  renderState,
  imageAssets,
}) => {
  renderCount += 1;
  const keyPrefix = `editor-thumbnail-${renderCount}:`;
  const toKey = (fileId) => `${keyPrefix}${fileId}`;
  const assets = {};
  for (const [fileId, asset] of Object.entries(imageAssets)) {
    assets[toKey(fileId)] = asset;
  }

  const host = document.createElement("div");
  const graphicsService = await createGraphicsService();
  try {
    await graphicsService.init({ canvas: host, width, height });
    if (Object.keys(assets).length > 0) {
      await graphicsService.loadAssets(assets);
    }
    await graphicsService.render(mapRenderStateSources(renderState, toKey));
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
