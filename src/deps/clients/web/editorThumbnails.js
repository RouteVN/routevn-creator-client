import { captureGraphicsThumbnailImage } from "../../../internal/runtime/graphicsEngineRuntime.js";
import { createGraphicsService } from "../../services/graphicsService.js";

const waitForPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

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

// Every WebGL context a page creates counts against the browser's limit
// until it is garbage collected, even once freed, and past the limit the
// oldest is lost, which can be an open page's canvas. So drawings of one size
// share a renderer, and it is made again only after a few, which bounds what
// its loaded files hold.
const DRAWINGS_PER_RENDERER = 6;

let rendererCount = 0;
let renderer;

// Frees the shared renderer, as the thumbnail queue does once it is empty.
export const releaseThumbnailRenderer = async () => {
  const current = renderer;
  renderer = undefined;
  if (current) {
    try {
      await current.graphicsService.destroy();
    } finally {
      current.host.remove();
    }
  }
};

const takeRenderer = async ({ width, height }) => {
  if (
    renderer &&
    (renderer.width !== width ||
      renderer.height !== height ||
      renderer.drawings >= DRAWINGS_PER_RENDERER)
  ) {
    await releaseThumbnailRenderer();
  }
  if (!renderer) {
    rendererCount += 1;
    const host = document.createElement("div");
    const graphicsService = await createGraphicsService();
    renderer = {
      id: rendererCount,
      host,
      graphicsService,
      width,
      height,
      drawings: 0,
      loadedKeys: new Set(),
    };
    await graphicsService.init({ canvas: host, width, height });
  }
  renderer.drawings += 1;
  return renderer;
};

// Draws `renderState` off screen, on the shared renderer, and returns its
// thumbnail as a JPEG data URL, at most 400 by 225, scaled straight from the
// frame's pixels. `imageAssets` maps each file id the state draws to
// `{ url, type }`.
//
// Its images load under the renderer's own keys. Textures are cached by key
// for every renderer, and freeing a renderer unloads the keys it loaded, so a
// key shared with the page's renderer would take the page's image away, or
// the page leaving would take this one's.
export const renderThumbnailImage = async ({
  width,
  height,
  renderState,
  imageAssets,
}) => {
  try {
    const current = await takeRenderer({ width, height });
    const { graphicsService, loadedKeys } = current;
    const keys = new Map();
    const assetsToLoad = {};
    for (const [fileId, asset] of Object.entries(imageAssets)) {
      const key = `editor-thumbnail-${current.id}-${fileId}`;
      keys.set(fileId, key);
      if (!loadedKeys.has(key)) {
        assetsToLoad[key] = asset;
      }
    }
    const toKey = (fileId) => keys.get(fileId) ?? fileId;

    // The last drawing goes first, so nothing of it carries over.
    await graphicsService.render({ elements: [], animations: [] });
    if (Object.keys(assetsToLoad).length > 0) {
      await graphicsService.loadAssets(assetsToLoad);
      Object.keys(assetsToLoad).forEach((key) => loadedKeys.add(key));
    }
    await graphicsService.render(mapRenderStateSources(renderState, toKey));
    await waitForPaint();
    const thumbnailImage = await captureGraphicsThumbnailImage(graphicsService);
    if (!thumbnailImage) {
      throw new Error("The canvas returned no thumbnail image.");
    }
    return thumbnailImage;
  } catch (error) {
    // A renderer that failed may be left in any state, so it is not reused.
    await releaseThumbnailRenderer();
    throw error;
  }
};
