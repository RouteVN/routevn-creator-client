import { createAnimationResourcePreviewStates } from "../../../internal/animationPreview.js";
import { generateId } from "../../../internal/id.js";
import { requireProjectResolution } from "../../../internal/projectResolution.js";
import { resolveResourceFileType } from "../../../internal/resourceFileMetadata.js";
import { selectAnimationsPageCopy } from "./animationsPageCopy.js";

const ANIMATION_PREVIEW_LOOP_PAUSE_MS = 1000;

const collectRuntimeMaskTextureIds = (mask = {}) => {
  if (!mask) {
    return [];
  }

  if (mask.kind === "single") {
    return mask.texture ? [mask.texture] : [];
  }

  if (mask.kind === "sequence") {
    return (mask.textures ?? []).filter(Boolean);
  }

  return (mask.items ?? []).map((item) => item?.texture).filter(Boolean);
};

const collectRuntimeElementTextureIds = (elements = []) => {
  const textureIds = [];

  for (const element of elements ?? []) {
    if (element?.type === "sprite" && element.src) {
      textureIds.push(element.src);
    }

    if (Array.isArray(element?.children)) {
      textureIds.push(...collectRuntimeElementTextureIds(element.children));
    }
  }

  return textureIds;
};

const collectRuntimeRenderStateTextureIds = (renderState = {}) => {
  return [
    ...collectRuntimeElementTextureIds(renderState.elements),
    ...(renderState.animations ?? []).flatMap((animation) =>
      collectRuntimeMaskTextureIds(animation.mask),
    ),
  ];
};

export const stopAnimationPreviewPlayback = ({ store } = {}) => {
  const frameId = store.selectAnimationPreviewFrameId?.();
  if (frameId !== undefined) {
    globalThis.cancelAnimationFrame?.(frameId);
  }

  store.clearAnimationPreviewPlayback?.();
};

export const stopAnimationPreview = ({ store } = {}) => {
  stopAnimationPreviewPlayback({ store });
  store.setAnimationPreviewRequestId?.({
    requestId: undefined,
  });
  store.setAnimationPreviewVisible?.({
    visible: false,
  });
};

const waitForAnimationPreviewPaint = async ({ canvas } = {}) => {
  if (canvas?.isConnected !== true) {
    return;
  }

  await new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => {
        globalThis.setTimeout(resolve, 0);
      });
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });
};

const ensureAnimationPreviewAssetsLoaded = async ({
  graphicsService,
  projectService,
  renderState,
} = {}) => {
  if (!graphicsService || !projectService || !renderState) {
    return;
  }

  const renderStates = Array.isArray(renderState) ? renderState : [renderState];
  const textureIds = Array.from(
    new Set(renderStates.flatMap(collectRuntimeRenderStateTextureIds)),
  );

  if (textureIds.length === 0) {
    return;
  }

  const repositoryState = projectService.getRepositoryState() ?? {};
  const imageItems = repositoryState.images?.items ?? {};
  const imageItemsByFileId = new Map(
    Object.values(imageItems)
      .filter((item) => item?.fileId)
      .map((item) => [item.fileId, item]),
  );
  const assets = {};

  for (const fileId of textureIds) {
    const fileResult = await projectService.getFileContent(fileId);
    const imageItem = imageItemsByFileId.get(fileId);
    assets[fileId] = {
      url: fileResult.url,
      type:
        resolveResourceFileType({
          item: imageItem,
          files: repositoryState.files,
        }) ??
        fileResult.type ??
        "image/png",
    };
  }

  await graphicsService.loadAssets(assets);
};

const ensureAnimationPreviewRuntime = async ({
  deps,
  itemId,
  width,
  height,
  forceInit = false,
} = {}) => {
  const { graphicsService, refs, store } = deps;
  const canvas = refs.detailCanvas;

  if (!graphicsService || !canvas) {
    return false;
  }

  const runtime = store.selectPreviewRuntime();
  const shouldInit =
    forceInit ||
    runtime.target !== itemId ||
    runtime.width !== width ||
    runtime.height !== height;

  if (!shouldInit) {
    return true;
  }

  await graphicsService.init({
    canvas,
    width,
    height,
  });
  store.setPreviewRuntime({
    target: itemId,
    width,
    height,
  });
  return true;
};

const hasTransitionPreviewAnimation = (renderState = {}) => {
  return (renderState.animations ?? []).some(
    (animation) => animation?.type === "transition",
  );
};

const primeTransitionPreviewFrame = async ({
  deps,
  renderState,
  resetState,
  shouldContinue,
} = {}) => {
  const { graphicsService } = deps;

  if (!hasTransitionPreviewAnimation(renderState)) {
    return true;
  }

  await graphicsService.render(resetState);
  await waitForAnimationPreviewPaint({
    canvas: deps.refs.detailCanvas,
  });

  if (!shouldContinue()) {
    return false;
  }

  await graphicsService.render(renderState);
  graphicsService.setAnimationTime(0);
  await waitForAnimationPreviewPaint({
    canvas: deps.refs.detailCanvas,
  });

  return shouldContinue();
};

const renderAnimationPreviewAtStart = async ({
  deps,
  itemId,
  primeTransition = false,
  renderState,
  requestId,
  resetState,
} = {}) => {
  const { graphicsService, store } = deps;
  const shouldContinue = () =>
    store.selectAnimationPreviewRequestId?.() === requestId &&
    store.selectSelectedItemId() === itemId;

  if (!graphicsService || !shouldContinue()) {
    return false;
  }

  graphicsService.setAnimationPlaybackMode("manual");
  graphicsService.setAnimationTime(0);

  if (primeTransition) {
    const primed = await primeTransitionPreviewFrame({
      deps,
      renderState,
      resetState,
      shouldContinue,
    });

    if (!primed) {
      return false;
    }
  }

  await graphicsService.render(resetState);
  await waitForAnimationPreviewPaint({
    canvas: deps.refs.detailCanvas,
  });

  if (!shouldContinue()) {
    return false;
  }

  await graphicsService.render(renderState);

  if (!shouldContinue()) {
    return false;
  }

  graphicsService.setAnimationTime(0);
  return true;
};

const scheduleAnimationPreviewLoopFrame = ({
  deps,
  itemId,
  durationMs,
  lastCycleIndex,
  renderState,
  requestId,
  resetState,
  startedAtMs,
} = {}) => {
  const { graphicsService, store } = deps;
  const resolvedDurationMs = Math.max(0, Number(durationMs) || 0);

  if (!graphicsService || resolvedDurationMs <= 0) {
    return;
  }

  if (typeof globalThis.requestAnimationFrame !== "function") {
    return;
  }

  const frameId = globalThis.requestAnimationFrame(async (timestamp) => {
    if (
      store.selectAnimationPreviewRequestId?.() !== requestId ||
      store.selectSelectedItemId() !== itemId
    ) {
      return;
    }

    const nextStartedAtMs = startedAtMs ?? timestamp;
    if (startedAtMs === undefined) {
      store.setAnimationPreviewStartedAtMs({
        startedAtMs: nextStartedAtMs,
      });
    }

    const elapsedMs = Math.max(0, timestamp - nextStartedAtMs);
    const cycleDurationMs =
      resolvedDurationMs + ANIMATION_PREVIEW_LOOP_PAUSE_MS;
    const cycleIndex = Math.floor(elapsedMs / cycleDurationMs);
    const cycleTimeMs = Math.floor(elapsedMs % cycleDurationMs);
    const lastPlayableTimeMs = Math.max(0, resolvedDurationMs - 1);
    const timeMs =
      cycleTimeMs >= resolvedDurationMs ? lastPlayableTimeMs : cycleTimeMs;
    const shouldRestartCycle =
      lastCycleIndex !== undefined && cycleIndex !== lastCycleIndex;

    if (shouldRestartCycle) {
      const rendered = await renderAnimationPreviewAtStart({
        deps,
        itemId,
        renderState,
        requestId,
        resetState,
      });

      if (!rendered) {
        return;
      }
    }

    if (
      store.selectAnimationPreviewRequestId?.() !== requestId ||
      store.selectSelectedItemId() !== itemId
    ) {
      return;
    }

    graphicsService.setAnimationTime(timeMs);
    scheduleAnimationPreviewLoopFrame({
      deps,
      itemId,
      durationMs: resolvedDurationMs,
      lastCycleIndex: cycleIndex,
      renderState,
      requestId,
      resetState,
      startedAtMs: nextStartedAtMs,
    });
  });

  store.setAnimationPreviewFrameId({
    frameId,
  });
};

const startAnimationPreviewLoop = ({
  deps,
  itemId,
  durationMs,
  renderState,
  requestId,
  resetState,
} = {}) => {
  const { store } = deps;
  const resolvedDurationMs = Math.max(0, Number(durationMs) || 0);
  stopAnimationPreviewPlayback({ store });

  if (!itemId || resolvedDurationMs <= 0) {
    return;
  }

  scheduleAnimationPreviewLoopFrame({
    deps,
    itemId,
    durationMs: resolvedDurationMs,
    renderState,
    requestId,
    resetState,
    startedAtMs: store.selectAnimationPreviewStartedAtMs(),
  });
};

export const renderSelectedAnimationPreview = async (
  deps,
  { forceInit = false } = {},
) => {
  const { appService, graphicsService, projectService, render, store } = deps;
  if (!graphicsService) {
    return;
  }

  const selectedAnimation = store.selectSelectedAnimation();
  if (!selectedAnimation) {
    stopAnimationPreview({ store });
    store.clearPreviewRuntime();
    return;
  }

  const itemId = selectedAnimation.id;
  stopAnimationPreviewPlayback({ store });
  store.setAnimationPreviewVisible?.({
    visible: false,
  });
  render?.();
  const requestId = generateId();
  store.setAnimationPreviewRequestId?.({
    requestId,
  });
  const shouldContinue = () =>
    store.selectAnimationPreviewRequestId?.() === requestId &&
    store.selectSelectedItemId() === itemId;
  const projectResolution = requireProjectResolution(
    store.selectProjectResolution(),
    "Project resolution",
  );
  const isReady = await ensureAnimationPreviewRuntime({
    deps,
    itemId,
    width: projectResolution.width,
    height: projectResolution.height,
    forceInit,
  });

  if (!isReady) {
    return;
  }

  await waitForAnimationPreviewPaint({
    canvas: deps.refs.detailCanvas,
  });

  if (!shouldContinue()) {
    return;
  }

  try {
    const { resetState, renderState, durationMs } =
      createAnimationResourcePreviewStates({
        animationItem: selectedAnimation,
        imagesData: store.selectImagesData(),
        projectResolution,
      });

    await ensureAnimationPreviewAssetsLoaded({
      graphicsService,
      projectService,
      renderState: [resetState, renderState],
    });

    if (!shouldContinue()) {
      return;
    }

    const rendered = await renderAnimationPreviewAtStart({
      deps,
      itemId,
      primeTransition: true,
      renderState,
      requestId,
      resetState,
    });

    if (!rendered) {
      return;
    }

    store.setAnimationPreviewVisible?.({
      visible: true,
    });
    render?.();
    startAnimationPreviewLoop({
      deps,
      itemId,
      durationMs,
      renderState,
      requestId,
      resetState,
    });
  } catch (error) {
    console.error("[animations] Failed to render animation preview", error);
    const copy = selectAnimationsPageCopy(deps.i18n);
    appService?.showToast?.({
      message:
        copy.failedRenderAnimationPreview ??
        "Failed to render animation preview.",
    });
  }
};
