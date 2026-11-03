import { createRendererStartError } from "../../../internal/rendererStartError.js";
import { captureGraphicsThumbnailImage } from "../../../internal/runtime/graphicsEngineRuntime.js";
import { createGraphicsService } from "../../services/graphicsService.js";

const waitForPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });

// A text style's font family, which can list several, comma separated.
const mapFontFamily = (fontFamily, toKey) => {
  if (Array.isArray(fontFamily)) {
    return fontFamily.map((family) =>
      typeof family === "string" ? toKey(family.trim()) : family,
    );
  }
  return fontFamily
    .split(",")
    .map((family) => toKey(family.trim()))
    .join(",");
};

// The render state with every file it draws read through `toKey`, at any
// depth and in any field: a sprite's `src`, a slider's `thumbSrc`, a hover
// image, a particle texture, or a text style's font family. An element's own
// `id` is left alone. `toKey` returns other strings as they are.
export const mapRenderStateSources = (renderState, toKey) => {
  const mapValue = (value) => {
    if (typeof value === "string") {
      return toKey(value);
    }
    if (Array.isArray(value)) {
      return value.map(mapValue);
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    const mapped = {};
    for (const [field, fieldValue] of Object.entries(value)) {
      if (field === "id") {
        mapped[field] = fieldValue;
      } else if (
        field === "fontFamily" &&
        (typeof fieldValue === "string" || Array.isArray(fieldValue))
      ) {
        mapped[field] = mapFontFamily(fieldValue, toKey);
      } else {
        mapped[field] = mapValue(fieldValue);
      }
    }
    return mapped;
  };
  return mapValue(renderState);
};

// Every WebGL context a page creates counts against the browser's limit
// until it is garbage collected, even once freed, and past the limit the
// oldest is lost, which can be an open page's canvas. So drawings of one size
// share a renderer, and it is made again only after a few, which bounds what
// its loaded files hold.
const DRAWINGS_PER_RENDERER = 6;

// Shared by every off-screen renderer, so no two have the same keys.
let rendererCount = 0;

// A renderer that draws off screen, one drawing at a time, and returns what
// `capture(graphicsService)` takes of each. `render` takes a state to draw and
// `assets`, which maps each file id the state draws to `{ url, type }`, and a
// font's to its `fontWeightDescriptor` too. `release` frees the renderer.
//
// Its files load under keys of the renderer's own, starting with `keyPrefix`.
// Assets are cached by key for every renderer, and freeing a renderer unloads
// the keys it loaded, so a key shared with the page's renderer would take the
// page's image or font away, or the page leaving would take this one's. A font
// is named by its key, so keys stay valid font family names.
//
// A graphics context that cannot be made or started rejects `render` with an
// error `isRendererStartError` recognizes; any other rejection is that
// drawing's own.
export const createOffscreenRenderer = ({ keyPrefix, capture }) => {
  let renderer;

  const release = async () => {
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

  const take = async ({ width, height }) => {
    if (
      renderer &&
      (renderer.width !== width ||
        renderer.height !== height ||
        renderer.drawings >= DRAWINGS_PER_RENDERER)
    ) {
      await release();
    }
    if (!renderer) {
      rendererCount += 1;
      const host = document.createElement("div");
      try {
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
      } catch (error) {
        throw createRendererStartError(error);
      }
    }
    renderer.drawings += 1;
    return renderer;
  };

  const render = async ({
    width,
    height,
    renderState,
    assets,
    settleMs = 0,
  }) => {
    try {
      const current = await take({ width, height });
      const { graphicsService, loadedKeys } = current;
      const keys = new Map();
      const assetsToLoad = {};
      for (const [fileId, asset] of Object.entries(assets)) {
        const key = `${keyPrefix}-${current.id}-${fileId}`;
        keys.set(fileId, key);
        if (!loadedKeys.has(key)) {
          assetsToLoad[key] = asset;
        }
      }
      // Only the files loaded here are renamed. Built-in particle textures,
      // such as "circle", and fonts the system has keep their names.
      const toKey = (fileId) => keys.get(fileId) ?? fileId;

      // The last drawing goes first, so nothing of it carries over, such as
      // particles already running.
      await graphicsService.render({ elements: [], animations: [] });
      if (Object.keys(assetsToLoad).length > 0) {
        await graphicsService.loadAssets(assetsToLoad);
        Object.keys(assetsToLoad).forEach((key) => loadedKeys.add(key));
      }
      await graphicsService.render(mapRenderStateSources(renderState, toKey));
      await waitForPaint();
      // Effects that move on the renderer's own clock, such as particles, run
      // for a while first, so the capture shows them going.
      if (settleMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, settleMs));
      }
      return await capture(graphicsService);
    } catch (error) {
      // A renderer that failed may be left in any state, so it is not reused.
      // Freeing it must not hide why it failed.
      await release().catch(() => undefined);
      throw error;
    }
  };

  return { render, release };
};

const thumbnailRenderer = createOffscreenRenderer({
  keyPrefix: "editor-thumbnail",
  capture: async (graphicsService) => {
    const thumbnailImage = await captureGraphicsThumbnailImage(graphicsService);
    if (!thumbnailImage) {
      throw new Error("The canvas returned no thumbnail image.");
    }
    return thumbnailImage;
  },
});

// Frees the shared renderer, as the thumbnail queue does once it is empty.
export const releaseThumbnailRenderer = () => thumbnailRenderer.release();

// Draws `renderState` off screen, on the shared renderer, and returns its
// thumbnail as a JPEG data URL, at most 400 by 225, scaled straight from the
// frame's pixels. `assets` maps each file id the state draws to
// `{ url, type }`, and a font's to its `fontWeightDescriptor` too.
export const renderThumbnailImage = (options) =>
  thumbnailRenderer.render(options);
