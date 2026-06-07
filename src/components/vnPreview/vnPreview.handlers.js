import { constructProjectData } from "../../internal/project/projection.js";
import {
  extractFileIdsForLayouts,
  extractSceneIdsFromValue,
  extractFileIdsForScenes,
  extractInitialHybridSceneIds,
  extractLayoutIdsFromValue,
  resolveEventBindings,
  extractTransitionTargetSceneIds,
  extractTransitionTargetSceneIdsFromActions,
} from "../../internal/project/layout.js";
import { prepareRuntimeInteractionExecution } from "../../internal/runtime/graphicsEngineRuntime.js";
import {
  collectPreviewMissingTargets,
  collectSceneIdsFromValue,
  collectSectionIdsFromValue,
  ensurePreviewProjectDataTargets,
  resolveSceneIdForSectionId,
  withPreviewEntryPoint,
} from "./support/vnPreviewProjectData.js";

const FORWARDED_PREVIEW_KEY_EVENT = "__rvnForwardedPreviewKeyEvent";
const PREVIEW_FORWARDED_KEYS = new Set(["Enter"]);
const PREVIEW_LEGACY_KEY_CODE_BY_KEY = new Map([["Enter", 13]]);

const focusPreviewSurface = (refs) => {
  const previewSurface = refs?.previewSurface;
  if (!previewSurface?.focus) {
    return;
  }

  previewSurface.focus({ preventScroll: true });
  if (typeof requestAnimationFrame !== "function") {
    return;
  }

  requestAnimationFrame(() => {
    if (previewSurface.isConnected === false) {
      return;
    }

    previewSurface.focus({ preventScroll: true });
  });
};

const suppressPreviewKeyboardEvent = (event) => {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
};

const isPreviewSurfaceEventTarget = (previewSurface, target) => {
  if (!previewSurface || !target) {
    return false;
  }

  if (target === previewSurface) {
    return true;
  }

  return typeof previewSurface.contains === "function"
    ? previewSurface.contains(target)
    : false;
};

const shouldForwardPreviewKeyEvent = (event, refs) => {
  const previewSurface = refs?.previewSurface;
  if (
    event?.[FORWARDED_PREVIEW_KEY_EVENT] === true ||
    event?.defaultPrevented ||
    !PREVIEW_FORWARDED_KEYS.has(event?.key) ||
    !previewSurface ||
    typeof previewSurface.dispatchEvent !== "function" ||
    typeof KeyboardEvent !== "function"
  ) {
    return false;
  }

  return !isPreviewSurfaceEventTarget(previewSurface, event.target);
};

const toPositiveInteger = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.round(numericValue)
    : undefined;
};

const resolveForwardedPreviewLegacyKeyCode = (event) => {
  return (
    toPositiveInteger(event?.keyCode) ??
    toPositiveInteger(event?.which) ??
    toPositiveInteger(event?.charCode) ??
    PREVIEW_LEGACY_KEY_CODE_BY_KEY.get(event?.key) ??
    0
  );
};

const defineForwardedPreviewEventProperty = (event, key, value) => {
  try {
    Object.defineProperty(event, key, {
      configurable: true,
      enumerable: true,
      value,
    });
    return event[key] === value;
  } catch {
    return false;
  }
};

const applyForwardedPreviewKeyEventProperties = (forwardedEvent, event) => {
  const legacyKeyCode = resolveForwardedPreviewLegacyKeyCode(event);
  const properties = {
    [FORWARDED_PREVIEW_KEY_EVENT]: true,
    altKey: event.altKey === true,
    charCode: legacyKeyCode,
    code: event.code,
    ctrlKey: event.ctrlKey === true,
    key: event.key,
    keyCode: legacyKeyCode,
    metaKey: event.metaKey === true,
    repeat: event.repeat === true,
    shiftKey: event.shiftKey === true,
    which: legacyKeyCode,
  };
  let didSetLegacyProperties = true;

  Object.entries(properties).forEach(([key, value]) => {
    const didSet = defineForwardedPreviewEventProperty(
      forwardedEvent,
      key,
      value,
    );
    if (
      (key === "charCode" || key === "keyCode" || key === "which") &&
      !didSet
    ) {
      didSetLegacyProperties = false;
    }
  });

  return didSetLegacyProperties;
};

const createForwardedPreviewKeyEvent = (event) => {
  if (typeof KeyboardEvent !== "function") {
    return undefined;
  }

  const legacyKeyCode = resolveForwardedPreviewLegacyKeyCode(event);
  const forwardedEvent = new KeyboardEvent(event.type, {
    altKey: event.altKey === true,
    bubbles: true,
    cancelable: true,
    charCode: legacyKeyCode,
    code: event.code,
    composed: true,
    ctrlKey: event.ctrlKey === true,
    key: event.key,
    keyCode: legacyKeyCode,
    metaKey: event.metaKey === true,
    repeat: event.repeat === true,
    shiftKey: event.shiftKey === true,
    which: legacyKeyCode,
  });
  if (applyForwardedPreviewKeyEventProperties(forwardedEvent, event)) {
    return forwardedEvent;
  }

  if (typeof Event !== "function") {
    return undefined;
  }

  const fallbackEvent = new Event(event.type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  return applyForwardedPreviewKeyEventProperties(fallbackEvent, event)
    ? fallbackEvent
    : undefined;
};

const forwardPreviewKeyEvent = (event, refs) => {
  const previewSurface = refs?.previewSurface;
  const forwardedEvent = createForwardedPreviewKeyEvent(event);
  if (!previewSurface || !forwardedEvent) {
    return false;
  }

  focusPreviewSurface(refs);
  previewSurface.dispatchEvent(forwardedEvent);
  return true;
};

const waitForBrowserPaint = async () => {
  if (typeof requestAnimationFrame !== "function") {
    await new Promise((resolve) => setTimeout(resolve, 32));
    return;
  }

  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
};

/**
 * Load assets (images and fonts) for rendering
 * @param {Object} deps - Component dependencies
 * @param {Array} fileReferences - File references with url and type to load
 * @returns {Promise<Object>} Loaded assets
 */
const loadAssets = async (deps, fileReferences) => {
  const { projectService } = deps;
  const assets = {};

  for (const fileObj of fileReferences) {
    const { url: fileId, type } = fileObj;
    const result = await projectService.getFileContent(fileId);
    assets[fileId] = {
      url: result.url,
      type: type || result.type || "image/png",
    };
  }

  return assets;
};

const resetAssetLoadCache = (store) => {
  store.resetAssetLoadCache();
};

const setAssetLoading = (deps, isLoading) => {
  const { store, render } = deps;
  store.setAssetLoading({ isLoading: isLoading });
  render();
};

async function loadAssetsForSceneIds(
  deps,
  projectData,
  sceneIds,
  { showLoading = true } = {},
) {
  const { appService, store } = deps;
  const allScenes = projectData?.story?.scenes || {};

  const uniqueSceneIds = Array.from(new Set(sceneIds || [])).filter(
    (sceneId) => !!allScenes[sceneId],
  );
  if (uniqueSceneIds.length === 0) {
    return;
  }

  const fileReferences = extractFileIdsForScenes(projectData, uniqueSceneIds);
  const missingFileReferences = fileReferences.filter((fileReference) => {
    const fileId = fileReference?.url;
    return fileId && !store.selectHasLoadedAssetFileId({ fileId });
  });
  const isAnySceneUntracked = uniqueSceneIds.some(
    (sceneId) => !store.selectHasLoadedAssetSceneId({ sceneId }),
  );

  if (missingFileReferences.length === 0 && !isAnySceneUntracked) {
    return;
  }

  const shouldShowLoading = showLoading && missingFileReferences.length > 0;

  try {
    if (shouldShowLoading) {
      setAssetLoading(deps, true);
    }

    if (missingFileReferences.length > 0) {
      const assets = await loadAssets(deps, missingFileReferences);
      const { graphicsService } = deps;
      await graphicsService.loadAssets(assets);

      store.markAssetFileIdsLoaded({
        fileIds: Object.keys(assets),
      });
    }

    store.markAssetSceneIdsLoaded({
      sceneIds: uniqueSceneIds,
    });
  } catch (error) {
    appService?.showAlert({
      message: "Failed to load some preview assets",
      title: "Warning",
    });
    console.error("[vnPreview] Failed to load scene assets:", error);
  } finally {
    if (shouldShowLoading) {
      setAssetLoading(deps, false);
    }
  }
}

const preloadDirectTransitionScenes = async (deps, projectData, sceneIds) => {
  const directTargets = Array.from(
    new Set(
      (sceneIds || []).flatMap((sceneId) =>
        extractTransitionTargetSceneIds(projectData, sceneId),
      ),
    ),
  );

  if (directTargets.length === 0) {
    return;
  }

  await loadAssetsForSceneIds(deps, projectData, directTargets, {
    showLoading: false,
  });
};

const preloadLayoutAssetsByIds = async (deps, projectData, layoutIds) => {
  const { store } = deps;
  const uniqueLayoutIds = Array.from(new Set(layoutIds || [])).filter(
    (layoutId) => Boolean(projectData?.resources?.layouts?.[layoutId]),
  );

  if (uniqueLayoutIds.length === 0) {
    return;
  }

  const fileReferences = extractFileIdsForLayouts(projectData, uniqueLayoutIds);
  const missingFileReferences = fileReferences.filter((fileReference) => {
    const fileId = fileReference?.url;
    return fileId && !store.selectHasLoadedAssetFileId({ fileId });
  });

  if (missingFileReferences.length === 0) {
    return;
  }

  const assets = await loadAssets(deps, missingFileReferences);
  const { graphicsService } = deps;
  await graphicsService.loadAssets(assets);

  store.markAssetFileIdsLoaded({
    fileIds: Object.keys(assets),
  });
};

const applyHydrationResult = (deps, runtime, hydrationResult) => {
  if (!hydrationResult?.didLoad) {
    return false;
  }

  runtime.projectData = hydrationResult.projectData;
  runtime.loadedSceneIds = new Set(hydrationResult.loadedSceneIds);
  deps.graphicsService.engineHandleActions(
    {
      updateProjectData: {
        projectData: runtime.projectData,
      },
    },
    undefined,
    {
      suppressRenderEffects: true,
    },
  );
  return true;
};

const hydratePreviewTargets = async (
  deps,
  {
    repository,
    runtime,
    sceneIds = [],
    sectionIds = [],
    initialSceneId,
    initialSectionId,
    initialLineId,
    showLoading = false,
  } = {},
) => {
  const { missingSceneIds, missingSectionIds } = collectPreviewMissingTargets({
    projectData: runtime.projectData,
    loadedSceneIds: Array.from(runtime.loadedSceneIds),
    sceneIds,
    sectionIds,
  });
  const hasMissingTargets =
    missingSceneIds.length > 0 || missingSectionIds.length > 0;

  if (!hasMissingTargets) {
    return {
      didLoad: false,
      projectData: runtime.projectData,
      loadedSceneIds: Array.from(runtime.loadedSceneIds),
      missingSceneIds,
      missingSectionIds,
    };
  }

  if (showLoading) {
    setAssetLoading(deps, true);
  }

  try {
    const hydrationResult = await ensurePreviewProjectDataTargets({
      repository,
      projectData: runtime.projectData,
      loadedSceneIds: Array.from(runtime.loadedSceneIds),
      sceneIds: missingSceneIds,
      sectionIds: missingSectionIds,
      initialSceneId,
      initialSectionId,
      initialLineId,
    });
    applyHydrationResult(deps, runtime, hydrationResult);
    return hydrationResult;
  } finally {
    if (showLoading) {
      setAssetLoading(deps, false);
    }
  }
};

const selectCurrentPointerSnapshot = (systemState = {}) => {
  const contexts = Array.isArray(systemState?.contexts)
    ? systemState.contexts
    : [];
  const currentContext = contexts[contexts.length - 1];
  const currentPointerMode = currentContext?.currentPointerMode ?? "read";
  const pointers = currentContext?.pointers ?? {};

  if (!currentContext || !currentPointerMode) {
    return {
      contextCount: contexts.length,
      currentPointer: undefined,
      currentPointerMode,
      pointerModes: Object.keys(pointers),
    };
  }

  return {
    contextCount: contexts.length,
    currentPointer: pointers[currentPointerMode],
    currentPointerMode,
    pointerModes: Object.keys(pointers),
  };
};

const createSceneTargetPrefetcher = (
  deps,
  { repository, runtime, initialSceneId, initialSectionId, initialLineId } = {},
) => {
  const prefetchedSceneIds = new Set();
  let prefetchQueue = Promise.resolve();

  return (sceneId) => {
    if (!sceneId || prefetchedSceneIds.has(sceneId)) {
      return;
    }

    prefetchedSceneIds.add(sceneId);
    prefetchQueue = prefetchQueue
      .then(async () => {
        const transitionSceneIds = extractTransitionTargetSceneIds(
          runtime.projectData,
          sceneId,
        );

        if (transitionSceneIds.length === 0) {
          return;
        }

        await hydratePreviewTargets(deps, {
          repository,
          runtime,
          sceneIds: transitionSceneIds,
          sectionIds: [],
          initialSceneId,
          initialSectionId,
          initialLineId,
          showLoading: false,
        });
        await loadAssetsForSceneIds(
          deps,
          runtime.projectData,
          transitionSceneIds,
          {
            showLoading: false,
          },
        );
        await preloadDirectTransitionScenes(
          deps,
          runtime.projectData,
          transitionSceneIds,
        );
      })
      .catch((error) => {
        prefetchedSceneIds.delete(sceneId);
        console.error("[vnPreview] Failed to prefetch scene targets:", error);
      });
  };
};

const createBeforeHandleActionsHook = (
  deps,
  { repository, runtime, sceneId, sectionId, lineId } = {},
) => {
  return async (actions, eventContext) => {
    const { eventData, preparedActions, resolvedActions } =
      await prepareRuntimeInteractionExecution({
        actions,
        eventContext,
        graphicsService: deps.graphicsService,
        canvasRoot: deps.refs?.canvas,
        resolveEventBindings,
      });
    const referencedSceneIds = collectSceneIdsFromValue(
      resolvedActions,
      eventData,
    );
    const referencedSectionIds = collectSectionIdsFromValue(
      resolvedActions,
      eventData,
    );

    await hydratePreviewTargets(deps, {
      repository,
      runtime,
      sceneIds: referencedSceneIds,
      sectionIds: referencedSectionIds,
      initialSceneId: sceneId,
      initialSectionId: sectionId,
      initialLineId: lineId,
      showLoading: true,
    });

    const layoutIds = Array.from(
      new Set([
        ...extractLayoutIdsFromValue(resolvedActions, runtime.projectData),
        ...extractLayoutIdsFromValue(eventData, runtime.projectData),
      ]),
    );
    if (layoutIds.length > 0) {
      await preloadLayoutAssetsByIds(deps, runtime.projectData, layoutIds);
    }

    const transitionSceneIds = Array.from(
      new Set([
        ...extractTransitionTargetSceneIdsFromActions(
          resolvedActions,
          runtime.projectData,
        ),
        ...extractTransitionTargetSceneIdsFromActions(
          eventData,
          runtime.projectData,
        ),
        ...extractSceneIdsFromValue(resolvedActions, runtime.projectData),
        ...extractSceneIdsFromValue(eventData, runtime.projectData),
      ]),
    );

    if (transitionSceneIds.length === 0) {
      return preparedActions;
    }

    await loadAssetsForSceneIds(deps, runtime.projectData, transitionSceneIds, {
      showLoading: false,
    });
    await preloadDirectTransitionScenes(
      deps,
      runtime.projectData,
      transitionSceneIds,
    );
    return preparedActions;
  };
};

export const handleBeforeMount = (deps) => {
  const { dispatchEvent, store, graphicsService, refs } = deps;
  function handleKeyDown(event) {
    if (event.key !== "Escape") {
      if (
        shouldForwardPreviewKeyEvent(event, refs) &&
        forwardPreviewKeyEvent(event, refs)
      ) {
        suppressPreviewKeyboardEvent(event);
      }
      return;
    }

    suppressPreviewKeyboardEvent(event);
    dispatchEvent(new CustomEvent("close"));
  }

  function handleKeyUp(event) {
    if (!shouldForwardPreviewKeyEvent(event, refs)) {
      return;
    }

    if (forwardPreviewKeyEvent(event, refs)) {
      suppressPreviewKeyboardEvent(event);
    }
  }

  window.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("keyup", handleKeyUp, true);

  return () => {
    store.setAssetLoading({ isLoading: false });
    store.setPreviewReady({ isPreviewReady: false });
    resetAssetLoadCache(store);
    void graphicsService.destroy?.();
    window.removeEventListener("keydown", handleKeyDown, true);
    window.removeEventListener("keyup", handleKeyUp, true);
  };
};

export const handleAfterMount = async (deps) => {
  const {
    dispatchEvent,
    projectService,
    graphicsService,
    refs,
    props: attrs,
    store,
  } = deps;
  focusPreviewSurface(refs);

  const repository = await projectService.ensureRepository();
  const { canvas } = refs;
  graphicsService.setEngineAudioMuted?.(false);
  store.setPreviewReady({ isPreviewReady: false });

  const sceneId = attrs.sceneId;
  const sectionId = attrs.sectionId;
  const lineId = attrs.lineId;

  const state =
    typeof sceneId === "string" && sceneId.length > 0
      ? await repository.getContextState({
          sceneIds: [sceneId],
        })
      : projectService.getRepositoryState();

  const projectData = constructProjectData(state, {
    initialSceneId: sceneId,
  });

  let projectDataWithInitial = withPreviewEntryPoint(projectData, {
    sceneId,
    sectionId,
    lineId,
  });
  const initialSceneIds = extractInitialHybridSceneIds(
    projectDataWithInitial,
    sceneId,
  );
  let loadedSceneIds =
    typeof sceneId === "string" && sceneId.length > 0 ? [sceneId] : [];

  if (initialSceneIds.length > 0) {
    const hydrationResult = await ensurePreviewProjectDataTargets({
      repository,
      projectData: projectDataWithInitial,
      loadedSceneIds,
      sceneIds: initialSceneIds,
      sectionIds: [],
      initialSceneId: sceneId,
      initialSectionId: sectionId,
      initialLineId: lineId,
    });

    if (hydrationResult.didLoad) {
      projectDataWithInitial = hydrationResult.projectData;
      loadedSceneIds = hydrationResult.loadedSceneIds;
    }
  }

  const runtime = {
    projectData: projectDataWithInitial,
    loadedSceneIds: new Set(loadedSceneIds),
  };
  const beforeHandleActions = createBeforeHandleActionsHook(deps, {
    repository,
    runtime,
    sceneId,
    sectionId,
    lineId,
  });
  const scheduleSceneTargetPrefetch = createSceneTargetPrefetcher(deps, {
    repository,
    runtime,
    initialSceneId: sceneId,
    initialSectionId: sectionId,
    initialLineId: lineId,
  });
  let lastRenderedSceneId;
  let lastDispatchedLineKey;
  const previewWidth = projectDataWithInitial?.screen?.width;
  const previewHeight = projectDataWithInitial?.screen?.height;
  store.setProjectResolution({
    projectResolution: {
      width: previewWidth,
      height: previewHeight,
    },
  });
  deps.render();
  await graphicsService.init({
    canvas: canvas,
    beforeHandleActions,
    width: previewWidth,
    height: previewHeight,
  });
  resetAssetLoadCache(store);
  store.setAssetLoading({ isLoading: false });

  await loadAssetsForSceneIds(deps, projectDataWithInitial, initialSceneIds, {
    showLoading: true,
  });
  void preloadDirectTransitionScenes(
    deps,
    projectDataWithInitial,
    initialSceneIds,
  );
  await graphicsService.initRouteEngine(runtime.projectData, {
    handleEffects: true,
    onRenderState: ({ systemState }) => {
      const { currentPointer } = selectCurrentPointerSnapshot(systemState);
      const currentSectionId = currentPointer?.sectionId;
      const currentLineId = currentPointer?.lineId;
      const currentLineKey =
        currentSectionId && currentLineId
          ? `${currentSectionId}:${currentLineId}`
          : undefined;

      if (currentLineKey && currentLineKey !== lastDispatchedLineKey) {
        lastDispatchedLineKey = currentLineKey;
        dispatchEvent(
          new CustomEvent("current-line-changed", {
            detail: {
              sectionId: currentSectionId,
              lineId: currentLineId,
            },
            bubbles: true,
            composed: true,
          }),
        );
      }

      const currentSceneId = resolveSceneIdForSectionId(
        runtime.projectData,
        currentSectionId,
      );

      if (!currentSceneId || currentSceneId === lastRenderedSceneId) {
        return;
      }

      lastRenderedSceneId = currentSceneId;
      scheduleSceneTargetPrefetch(currentSceneId);
    },
  });
  await waitForBrowserPaint();
  store.setPreviewReady({ isPreviewReady: true });
  deps.render();
};
