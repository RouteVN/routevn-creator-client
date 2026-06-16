import { isVisualTestMode } from "../../internal/visualTestMode.js";
import {
  resolveSpritesheetAnimationFps,
  resolveSpritesheetFrameName,
} from "../../internal/spritesheets.js";

const PREVIEW_PADDING_PX = 16;
const DEFAULT_TRANSPARENCY_GRID_CELL_SIZE_PX = 12;
const TRANSPARENCY_GRID_LIGHT_COLOR = "#eef2f7";
const TRANSPARENCY_GRID_DARK_COLOR = "#94a3b8";

const isPaused = (value) => value === true || value === "true";

const isCheckerboardVisible = (value) => {
  if (value === undefined) {
    return true;
  }

  if (value === false) {
    return false;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return !(
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no" ||
      normalized === "off" ||
      normalized === "none"
    );
  }

  return true;
};

const resolvePreviewPadding = (canvas) => {
  const minDimension = Math.min(canvas.width, canvas.height);
  if (minDimension <= 0) {
    return 0;
  }

  return Math.min(PREVIEW_PADDING_PX, Math.floor(minDimension / 8));
};

const resolveTransparencyGridCellSize = (width, height, props = {}) => {
  const explicitSize = Number(props.checkerCellSize);
  if (Number.isFinite(explicitSize) && explicitSize > 0) {
    return Math.round(explicitSize);
  }

  const minDimension = Math.min(width, height);
  if (minDimension <= 0) {
    return DEFAULT_TRANSPARENCY_GRID_CELL_SIZE_PX;
  }

  return Math.max(
    4,
    Math.min(
      DEFAULT_TRANSPARENCY_GRID_CELL_SIZE_PX,
      Math.floor(minDimension / 8),
    ),
  );
};

const drawTransparencyGrid = (context, width, height, props = {}) => {
  const cellSize = resolveTransparencyGridCellSize(width, height, props);

  context.fillStyle = TRANSPARENCY_GRID_LIGHT_COLOR;
  context.fillRect(0, 0, width, height);

  context.fillStyle = TRANSPARENCY_GRID_DARK_COLOR;
  for (let y = 0; y < height; y += cellSize) {
    const rowIndex = Math.floor(y / cellSize);
    for (let x = 0; x < width; x += cellSize) {
      const columnIndex = Math.floor(x / cellSize);
      if ((rowIndex + columnIndex) % 2 === 0) {
        context.fillRect(x, y, cellSize, cellSize);
      }
    }
  }
};

const clearCanvas = (canvas, props = {}) => {
  if (
    typeof HTMLCanvasElement === "undefined" ||
    !(canvas instanceof HTMLCanvasElement)
  ) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
  const height = Math.max(
    1,
    Math.round(rect.height || canvas.clientHeight || 1),
  );

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  if (isCheckerboardVisible(props.showCheckerboard)) {
    drawTransparencyGrid(context, width, height, props);
  }
};

const revokeOwnedImageSrc = (store) => {
  const imageSrc = store.selectImageSrc();
  if (store.selectOwnsImageSrc() && imageSrc.startsWith("blob:")) {
    URL.revokeObjectURL(imageSrc);
  }
};

const stopAnimation = (store) => {
  const animationFrameId = store.selectAnimationFrameId();
  if (animationFrameId === undefined) {
    return;
  }

  cancelAnimationFrame(animationFrameId);
  store.clearAnimationFrameId();
};

const resolveFrameNames = (atlas = {}) => Object.keys(atlas.frames ?? {});

const resolveFrameData = ({ atlas, animation, frameOffset = 0 } = {}) => {
  const frameNames = resolveFrameNames(atlas);
  if (frameNames.length === 0) {
    return undefined;
  }

  const animationFrames = animation?.frames;
  const frameRef = Array.isArray(animationFrames)
    ? (animationFrames[frameOffset] ?? animationFrames[0])
    : 0;
  const resolvedFrameName = resolveSpritesheetFrameName(frameNames, frameRef);
  const frameName =
    typeof resolvedFrameName === "string" && atlas.frames?.[resolvedFrameName]
      ? resolvedFrameName
      : frameNames[0];

  return atlas.frames?.[frameName];
};

const drawFrame = (deps, { frameOffset = 0 } = {}) => {
  const { props, refs } = deps;
  const { canvas, sourceImage } = refs;

  if (
    typeof HTMLCanvasElement === "undefined" ||
    typeof HTMLImageElement === "undefined" ||
    !(canvas instanceof HTMLCanvasElement) ||
    !(sourceImage instanceof HTMLImageElement)
  ) {
    return;
  }

  clearCanvas(canvas, props);

  if (!sourceImage.complete || sourceImage.naturalWidth <= 0) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const frame = resolveFrameData({
    atlas: props.atlas,
    animation: props.animation,
    frameOffset,
  });

  const sourceFrame = frame?.frame;
  const sourceSize = frame?.sourceSize;
  const spriteSourceSize = frame?.spriteSourceSize;
  const outputWidth =
    sourceSize?.w ?? sourceFrame?.w ?? sourceImage.naturalWidth;
  const outputHeight =
    sourceSize?.h ?? sourceFrame?.h ?? sourceImage.naturalHeight;

  const previewPadding = resolvePreviewPadding(canvas);
  const availableWidth = Math.max(1, canvas.width - previewPadding * 2);
  const availableHeight = Math.max(1, canvas.height - previewPadding * 2);
  const scale = Math.min(
    availableWidth / Math.max(1, outputWidth),
    availableHeight / Math.max(1, outputHeight),
  );
  const scaledOutputWidth = outputWidth * scale;
  const scaledOutputHeight = outputHeight * scale;
  const outputX = (canvas.width - scaledOutputWidth) / 2;
  const outputY = (canvas.height - scaledOutputHeight) / 2;

  if (!sourceFrame) {
    context.drawImage(
      sourceImage,
      outputX,
      outputY,
      scaledOutputWidth,
      scaledOutputHeight,
    );
    return;
  }

  const drawX = outputX + (spriteSourceSize?.x ?? 0) * scale;
  const drawY = outputY + (spriteSourceSize?.y ?? 0) * scale;
  const drawWidth = (spriteSourceSize?.w ?? sourceFrame.w) * scale;
  const drawHeight = (spriteSourceSize?.h ?? sourceFrame.h) * scale;

  context.drawImage(
    sourceImage,
    sourceFrame.x,
    sourceFrame.y,
    sourceFrame.w,
    sourceFrame.h,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
};

const startAnimation = (deps) => {
  const { props, store } = deps;
  stopAnimation(store);
  store.setPlaybackStartedAt({ playbackStartedAt: 0 });

  const frameCount = props.animation?.frames?.length ?? 0;
  if (frameCount <= 1) {
    drawFrame(deps);
    return;
  }

  if (isVisualTestMode()) {
    drawFrame(deps, { frameOffset: 0 });
    return;
  }

  const fps = Math.max(1, resolveSpritesheetAnimationFps(props.animation));
  const loop = props.animation?.loop ?? true;

  let lastRenderedFrame = -1;

  const tick = (timestamp) => {
    if (store.selectPlaybackStartedAt() <= 0) {
      store.setPlaybackStartedAt({ playbackStartedAt: timestamp });
    }

    const playbackStartedAt = store.selectPlaybackStartedAt();
    const elapsedMs = Math.max(0, timestamp - playbackStartedAt);
    const frameDurationMs = 1000 / fps;
    let frameOffset = Math.floor(elapsedMs / frameDurationMs);

    if (loop) {
      frameOffset %= frameCount;
    } else if (frameOffset >= frameCount) {
      frameOffset = frameCount - 1;
    }

    if (frameOffset !== lastRenderedFrame) {
      lastRenderedFrame = frameOffset;
      drawFrame(deps, { frameOffset });
    }

    if (!loop && frameOffset >= frameCount - 1) {
      store.clearAnimationFrameId();
      return;
    }

    const animationFrameId = requestAnimationFrame(tick);
    store.setAnimationFrameId({ animationFrameId });
  };

  const animationFrameId = requestAnimationFrame(tick);
  store.setAnimationFrameId({ animationFrameId });
};

const getSourceImageSrc = (sourceImage) => {
  return (
    sourceImage?.getAttribute?.("src") ??
    sourceImage?.currentSrc ??
    sourceImage?.src ??
    ""
  );
};

const isCurrentSourceImageLoaded = ({ refs, store } = {}) => {
  const sourceImage = refs?.sourceImage;
  if (
    typeof HTMLImageElement === "undefined" ||
    !(sourceImage instanceof HTMLImageElement) ||
    !sourceImage.complete ||
    sourceImage.naturalWidth <= 0
  ) {
    return false;
  }

  const imageSrc = store.selectImageSrc();
  return imageSrc.length > 0 && getSourceImageSrc(sourceImage) === imageSrc;
};

const renderReadySourceImage = (deps) => {
  const { props, render, store } = deps;
  stopAnimation(store);
  store.setStatus({ status: "ready" });
  drawFrame(deps);
  if (!isPaused(props.paused)) {
    startAnimation(deps);
  }
  render();
};

const syncReadySourceImage = (deps) => {
  const { store } = deps;
  if (store.selectStatus() !== "loading") {
    return;
  }

  if (isCurrentSourceImageLoaded(deps)) {
    renderReadySourceImage(deps);
  }
};

const renderImageSourceChange = (deps) => {
  const { render } = deps;
  render();
  syncReadySourceImage(deps);

  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => {
      syncReadySourceImage(deps);
    });
  }
};

const loadImageSource = async (deps) => {
  const { projectService, props, refs, render, store } = deps;

  stopAnimation(store);
  revokeOwnedImageSrc(store);
  clearCanvas(refs.canvas, props);
  store.setImageSrc({
    imageSrc: "",
    ownsImageSrc: false,
  });

  if (typeof props.src === "string" && props.src.length > 0) {
    store.setStatus({ status: "loading" });
    store.setImageSrc({
      imageSrc: props.src,
      ownsImageSrc: false,
    });
    renderImageSourceChange(deps);
    return;
  }

  if (typeof props.fileId !== "string" || props.fileId.length === 0) {
    store.setStatus({ status: "empty" });
    render();
    return;
  }

  store.setStatus({ status: "loading" });
  render();

  try {
    const { url } = await projectService.getFileContent(props.fileId);
    store.setImageSrc({
      imageSrc: url ?? "",
      ownsImageSrc: true,
    });
    renderImageSourceChange(deps);
  } catch {
    store.setStatus({ status: "error" });
    render();
  }
};

const didSourceChange = (oldProps = {}, newProps = {}) => {
  return (
    oldProps?.src !== newProps?.src || oldProps?.fileId !== newProps?.fileId
  );
};

const didFrameRenderingChange = (oldProps = {}, newProps = {}) => {
  return (
    oldProps?.previewKey !== newProps?.previewKey ||
    oldProps?.key !== newProps?.key ||
    oldProps?.atlas !== newProps?.atlas ||
    oldProps?.animation !== newProps?.animation
  );
};

const didPausedChange = (oldProps = {}, newProps = {}) => {
  return oldProps?.paused !== newProps?.paused;
};

export const handleBeforeMount = (deps) => {
  return () => {
    const { props, refs, store } = deps;
    stopAnimation(store);
    clearCanvas(refs.canvas, props);
    revokeOwnedImageSrc(store);
  };
};

export const handleAfterMount = async (deps) => {
  clearCanvas(deps.refs.canvas, deps.props);
  await loadImageSource(deps);
};

export const handleOnUpdate = async (deps, payload = {}) => {
  const { render, store } = deps;
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};

  if (didSourceChange(oldProps, newProps)) {
    await loadImageSource({
      ...deps,
      props: newProps,
    });
    return;
  }

  if (
    (didFrameRenderingChange(oldProps, newProps) ||
      didPausedChange(oldProps, newProps)) &&
    store.selectStatus() === "ready"
  ) {
    stopAnimation(store);
    drawFrame({
      ...deps,
      props: newProps,
    });
    if (!isPaused(newProps.paused)) {
      startAnimation({
        ...deps,
        props: newProps,
      });
    }
    render();
  }
};

export const handleSourceImageLoad = (deps) => {
  renderReadySourceImage(deps);
};

export const handleSourceImageError = (deps) => {
  const { props, render, refs, store } = deps;
  stopAnimation(store);
  clearCanvas(refs.canvas, props);
  store.setStatus({ status: "error" });
  render();
};
