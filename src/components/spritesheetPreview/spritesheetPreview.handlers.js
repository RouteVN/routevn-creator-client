const PREVIEW_PADDING_PX = 16;
const DEFAULT_FPS = 30;

const clearCanvas = (canvas) => {
  if (!(canvas instanceof HTMLCanvasElement)) {
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
  context.fillStyle = "#151515";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(255,255,255,0.08)";
  for (let x = 0; x < width; x += 24) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 24) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
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
  const frameIndex = Array.isArray(animationFrames)
    ? (animationFrames[frameOffset] ?? animationFrames[0])
    : 0;
  const frameName = frameNames[frameIndex] ?? frameNames[0];

  return atlas.frames?.[frameName];
};

const drawFrame = (deps, { frameOffset = 0 } = {}) => {
  const { props, refs } = deps;
  const { canvas, sourceImage } = refs;

  if (
    !(canvas instanceof HTMLCanvasElement) ||
    !(sourceImage instanceof HTMLImageElement)
  ) {
    return;
  }

  clearCanvas(canvas);

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

  const availableWidth = Math.max(1, canvas.width - PREVIEW_PADDING_PX * 2);
  const availableHeight = Math.max(1, canvas.height - PREVIEW_PADDING_PX * 2);
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

  const fps = Math.max(
    1,
    Number(props.animation?.animationSpeed ?? DEFAULT_FPS / 60) * 60,
  );
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

const loadImageSource = async (deps) => {
  const { projectService, props, render, store } = deps;

  stopAnimation(store);
  revokeOwnedImageSrc(store);
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
    render();
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
    render();
  } catch {
    store.setStatus({ status: "error" });
    render();
  }
};

export const handleBeforeMount = (deps) => {
  return () => {
    const { refs, store } = deps;
    stopAnimation(store);
    clearCanvas(refs.canvas);
    revokeOwnedImageSrc(store);
  };
};

export const handleAfterMount = async (deps) => {
  clearCanvas(deps.refs.canvas);
  await loadImageSource(deps);
};

export const handleSourceImageLoad = (deps) => {
  const { render, store } = deps;
  store.setStatus({ status: "ready" });
  drawFrame(deps);
  startAnimation(deps);
  render();
};

export const handleSourceImageError = (deps) => {
  const { render, refs, store } = deps;
  stopAnimation(store);
  clearCanvas(refs.canvas);
  store.setStatus({ status: "error" });
  render();
};
