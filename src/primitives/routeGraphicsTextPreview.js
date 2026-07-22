import createRouteGraphics, { textPlugin } from "route-graphics";
import {
  createRouteGraphicsTextPreviewCacheKey,
  createRouteGraphicsTextPreviewState,
  getParentElementAcrossShadowRoot,
} from "../internal/routeGraphicsTextPreview.js";

export const ROUTE_GRAPHICS_TEXT_PREVIEW_TAG_NAME =
  "rvn-route-graphics-text-preview";

const THUMBNAIL_CACHE_LIMIT = 128;
const TRANSPARENT_COLOR_PATTERN =
  /^(?:transparent|rgba\(\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*\d+(?:\.\d+)?\s*,\s*0(?:\.0+)?\s*\))$/i;

const isTransparentColor = (value) =>
  !value || TRANSPARENT_COLOR_PATTERN.test(String(value).trim());

let colorNormalizationContext;

const normalizeCssColor = (value) => {
  if (!value || isTransparentColor(value)) {
    return "rgba(0, 0, 0, 0)";
  }

  if (!colorNormalizationContext) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorNormalizationContext = canvas.getContext("2d", {
      willReadFrequently: true,
    });
  }

  const context = colorNormalizationContext;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alphaByte] = context.getImageData(0, 0, 1, 1).data;
  const alpha = Number((alphaByte / 255).toFixed(3));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const resolveCurrentColor = (element, value) => {
  const resolvedColor =
    value === "currentColor" || value === "inherit"
      ? getComputedStyle(element).color
      : value;

  return normalizeCssColor(resolvedColor);
};

const findVisibleBackgroundColor = (element) => {
  let current = getParentElementAcrossShadowRoot(element);

  while (current) {
    const backgroundColor = getComputedStyle(current).backgroundColor;
    if (!isTransparentColor(backgroundColor)) {
      return normalizeCssColor(backgroundColor);
    }
    current = getParentElementAcrossShadowRoot(current);
  }

  return "#000000";
};

const resolveRuntimePreview = (element, preview = {}) => {
  const textStyle = {
    ...preview.textStyle,
    fill: resolveCurrentColor(element, preview.textStyle?.fill),
  };
  let backgroundColor = resolveCurrentColor(element, preview.backgroundColor);

  if (isTransparentColor(backgroundColor)) {
    backgroundColor = findVisibleBackgroundColor(element);
  }

  return {
    ...preview,
    backgroundColor,
    textStyle,
  };
};

const createRenderer = async ({ width, height, backgroundColor }) => {
  const routeGraphics = createRouteGraphics();
  await routeGraphics.init({
    width,
    height,
    backgroundColor,
    debug: true,
    animationPlaybackMode: "manual",
    plugins: {
      elements: [textPlugin],
    },
  });
  return routeGraphics;
};

const attachCanvas = (routeGraphics, canvasHost) => {
  const canvas = routeGraphics.canvas;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  if (canvas.parentNode !== canvasHost) {
    canvasHost.replaceChildren(canvas);
  }
};

const thumbnailCache = new Map();
const pendingThumbnails = new Map();
let thumbnailRenderQueue = Promise.resolve();
let thumbnailRouteGraphics;
let thumbnailRendererSize = { width: 0, height: 0 };

const rememberThumbnail = (key, value) => {
  thumbnailCache.delete(key);
  thumbnailCache.set(key, value);

  while (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    const oldestKey = thumbnailCache.keys().next().value;
    thumbnailCache.delete(oldestKey);
  }
};

const ensureThumbnailRenderer = async ({ width, height, backgroundColor }) => {
  if (
    thumbnailRouteGraphics &&
    thumbnailRendererSize.width === width &&
    thumbnailRendererSize.height === height
  ) {
    thumbnailRouteGraphics.updatedBackgroundColor(backgroundColor);
    return thumbnailRouteGraphics;
  }

  thumbnailRouteGraphics?.destroy();
  thumbnailRouteGraphics = await createRenderer({
    width,
    height,
    backgroundColor,
  });
  thumbnailRendererSize = { width, height };
  return thumbnailRouteGraphics;
};

const generateThumbnail = ({ preview, width, height, backgroundColor }) => {
  const key = createRouteGraphicsTextPreviewCacheKey({
    preview,
    width,
    height,
    backgroundColor,
  });
  const cachedThumbnail = thumbnailCache.get(key);

  if (cachedThumbnail) {
    rememberThumbnail(key, cachedThumbnail);
    return Promise.resolve(cachedThumbnail);
  }

  if (pendingThumbnails.has(key)) {
    return pendingThumbnails.get(key);
  }

  const renderJob = thumbnailRenderQueue.then(async () => {
    const routeGraphics = await ensureThumbnailRenderer({
      width,
      height,
      backgroundColor,
    });
    routeGraphics.render(
      createRouteGraphicsTextPreviewState({ preview, width, height }),
    );
    const image = await routeGraphics.extractBase64();
    rememberThumbnail(key, image);
    return image;
  });

  thumbnailRenderQueue = renderJob.catch(() => undefined);
  pendingThumbnails.set(key, renderJob);
  void renderJob.then(
    () => pendingThumbnails.delete(key),
    () => pendingThumbnails.delete(key),
  );
  return renderJob;
};

const createShell = () => {
  const canvasHost = document.createElement("div");
  canvasHost.dataset.role = "canvas-host";
  canvasHost.style.position = "absolute";
  canvasHost.style.inset = "0";
  canvasHost.style.display = "none";

  const thumbnail = document.createElement("img");
  thumbnail.dataset.role = "thumbnail";
  thumbnail.alt = "";
  thumbnail.draggable = false;
  thumbnail.style.display = "none";
  thumbnail.style.width = "100%";
  thumbnail.style.height = "100%";

  return { canvasHost, thumbnail };
};

export class RouteGraphicsTextPreviewElement extends HTMLElement {
  constructor() {
    super();
    this._preview = {};
    this._previewKey = "";
    this._renderFrameId = undefined;
    this._renderVersion = 0;
    this._routeGraphics = undefined;
    this._rendererSize = { width: 0, height: 0 };
    this._renderQueue = Promise.resolve();
    this._resizeObserver = new ResizeObserver(() => this.scheduleRender());
    this._refs = createShell();
  }

  connectedCallback() {
    if (!this._refs.canvasHost.parentNode) {
      this.append(this._refs.canvasHost, this._refs.thumbnail);
    }

    this.style.display = "block";
    this.style.position = "relative";
    this.style.width = "100%";
    this.style.height = "100%";
    this.style.minWidth = "0";
    this.style.minHeight = "0";
    this.style.overflow = "hidden";
    this.setAttribute("role", "img");
    this._resizeObserver.observe(this);
    this.scheduleRender();
  }

  disconnectedCallback() {
    this._renderVersion += 1;
    this._resizeObserver.disconnect();
    if (this._renderFrameId !== undefined) {
      cancelAnimationFrame(this._renderFrameId);
      this._renderFrameId = undefined;
    }

    this._renderQueue = this._renderQueue.finally(() => {
      this._routeGraphics?.destroy();
      this._routeGraphics = undefined;
      this._rendererSize = { width: 0, height: 0 };
    });
  }

  set preview(value) {
    const nextPreview = value ?? {};
    const nextKey = JSON.stringify(nextPreview);
    if (nextKey === this._previewKey) {
      return;
    }

    this._preview = nextPreview;
    this._previewKey = nextKey;
    this.setAttribute("aria-label", nextPreview.content ?? "");
    this.scheduleRender();
  }

  get preview() {
    return this._preview;
  }

  scheduleRender() {
    if (!this.isConnected || this._renderFrameId !== undefined) {
      return;
    }

    this._renderFrameId = requestAnimationFrame(() => {
      this._renderFrameId = undefined;
      const bounds = this.getBoundingClientRect();
      const width = Math.round(bounds.width);
      const height = Math.round(bounds.height);
      if (width <= 0 || height <= 0) {
        return;
      }

      const version = ++this._renderVersion;
      const preview = resolveRuntimePreview(this, this._preview);
      this._renderQueue = this._renderQueue
        .then(() => this.renderPreview({ preview, width, height, version }))
        .catch((error) => {
          if (version !== this._renderVersion || !this.isConnected) {
            return;
          }
          this.dataset.previewStatus = "error";
          console.warn("Failed to render Route Graphics text preview", error);
        });
    });
  }

  async renderPreview({ preview, width, height, version }) {
    if (preview.mode === "live") {
      await this.renderLivePreview({ preview, width, height, version });
      return;
    }

    this._refs.canvasHost.style.display = "none";
    const image = await generateThumbnail({
      preview,
      width,
      height,
      backgroundColor: preview.backgroundColor,
    });
    if (version !== this._renderVersion || !this.isConnected) {
      return;
    }

    this._refs.thumbnail.src = image;
    this._refs.thumbnail.style.display = "block";
    this.dataset.previewStatus = "ready";
  }

  async renderLivePreview({ preview, width, height, version }) {
    this._refs.thumbnail.style.display = "none";
    if (
      !this._routeGraphics ||
      this._rendererSize.width !== width ||
      this._rendererSize.height !== height
    ) {
      this._routeGraphics?.destroy();
      this._routeGraphics = await createRenderer({
        width,
        height,
        backgroundColor: preview.backgroundColor,
      });
      this._rendererSize = { width, height };
    } else {
      this._routeGraphics.updatedBackgroundColor(preview.backgroundColor);
    }

    if (version !== this._renderVersion || !this.isConnected) {
      return;
    }

    this._routeGraphics.render(
      createRouteGraphicsTextPreviewState({ preview, width, height }),
    );
    attachCanvas(this._routeGraphics, this._refs.canvasHost);
    this._refs.canvasHost.style.display = "block";
    this.dataset.previewStatus = "ready";
  }
}
