import {
  debounceTime,
  EMPTY,
  filter,
  fromEvent,
  map,
  switchMap,
  tap,
  throttleTime,
} from "rxjs";
import {
  extractFileIdsForLayouts,
  extractFileIdsForScenes,
  extractFileIdsForValue,
  extractInitialHybridSceneIds,
  extractLayoutIdsFromValue,
  extractSceneIdsFromValue,
  extractTransitionTargetSceneIds,
  extractTransitionTargetSceneIdsFromActions,
  resolveEventBindings,
} from "../../project/layout.js";
import { normalizeLineActions } from "../../project/engineActions.js";
import {
  sanitizeProjectDataForRouteEngine,
  summarizeProjectDataForRouteEngine,
} from "../../project/routeEngineProjectData.js";
import { prepareRuntimeInteractionExecution } from "../../runtime/graphicsEngineRuntime.js";
import {
  createBackgroundTransformEditorCanvasState,
  createProjectDataWithBackgroundTransformEditor,
} from "./backgroundTransformEditor.js";
import {
  debugLog,
  getDebugDurationMs,
  getDebugNow,
  isDebugEnabled,
} from "../../../deps/services/shared/debugLog.js";
import {
  logCharacterSpritesDebug,
  summarizeCharacterSpriteActionItems,
  summarizeCharacterSpriteProjectData,
  warnCharacterSpritesDebug,
} from "../../characterSpriteDebug.js";

const NO_PENDING_CANVAS_RENDER = Symbol("no-pending-canvas-render");
const SCENE_EDITOR_PERF_SCOPE = "scene-editor-perf";
const CANVAS_RUNTIME_LINE_SYNC_WINDOW_MS = 1200;

const isSceneEditorPreviewVisible = (store) => {
  return store?.selectPreviewScene?.()?.previewVisible === true;
};

const waitForNextFrame = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });

const getPresentationStateSnapshot = (store) => {
  try {
    return JSON.stringify(store.selectEffectivePresentationState?.() ?? {});
  } catch {
    return undefined;
  }
};

const selectCurrentRouteEnginePointerSnapshot = (systemState = {}) => {
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

const createRuntimeCurrentLineRenderStateHandler = (deps) => {
  const { subject } = deps;
  let lastDispatchedLineKey;

  return ({ systemState }) => {
    const { currentPointer } =
      selectCurrentRouteEnginePointerSnapshot(systemState);
    const sectionId = currentPointer?.sectionId;
    const lineId = currentPointer?.lineId;
    const lineKey = sectionId && lineId ? `${sectionId}:${lineId}` : undefined;

    if (!lineKey) {
      return;
    }

    if (lineKey === lastDispatchedLineKey) {
      return;
    }

    lastDispatchedLineKey = lineKey;
    subject.dispatch("sceneEditor.runtimeCurrentLineChanged", {
      sectionId,
      lineId,
    });
  };
};

const getCanvasRootFromHost = (canvasHost) => {
  const canvasRoot =
    canvasHost?.getCanvasRoot?.() ||
    canvasHost?.shadowRoot?.querySelector?.("#canvas") ||
    canvasHost?.querySelector?.("#canvas");

  if (canvasRoot?.isConnected) {
    return canvasRoot;
  }

  return canvasRoot;
};

const getBackgroundTransformEditorCanvasRoot = (refs) => {
  const nestedCanvasRoot =
    refs?.systemActions?.transformedHandlers?.handleGetBackgroundTransformPreviewCanvasRoot?.();
  if (nestedCanvasRoot?.isConnected) {
    return nestedCanvasRoot;
  }

  return getCanvasRootFromHost(refs?.backgroundTransformPreviewCanvasHost);
};

const getCurrentCanvasRoot = (
  refs,
  { preferTransformEditorCanvas = false } = {},
) => {
  if (preferTransformEditorCanvas) {
    const transformEditorCanvasRoot =
      getBackgroundTransformEditorCanvasRoot(refs);
    if (transformEditorCanvasRoot?.isConnected) {
      return transformEditorCanvasRoot;
    }
  }

  return getCanvasRootFromHost(refs?.previewCanvasHost);
};

const waitForMountedCanvasRoot = async (refs, maxFrames = 10, options = {}) => {
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const canvasRoot = getCurrentCanvasRoot(refs, options);
    if (canvasRoot?.isConnected) {
      return canvasRoot;
    }

    await waitForNextFrame();
  }

  return getCurrentCanvasRoot(refs, options);
};

const attachGraphicsCanvasToMountedRoot = async (deps, maxFrames = 10) => {
  const preferTransformEditorCanvas =
    deps?.store?.selectIsBackgroundTransformEditorOpen?.() === true;
  const mountedCanvasRoot = await waitForMountedCanvasRoot(
    deps?.refs,
    maxFrames,
    { preferTransformEditorCanvas },
  );
  if (!mountedCanvasRoot?.isConnected) {
    return mountedCanvasRoot;
  }

  await deps?.graphicsService?.attachCanvas?.(mountedCanvasRoot);
  return mountedCanvasRoot;
};

export const createSceneEditorRenderQueue = (renderCanvas) => {
  let activeRenderPromise;
  let pendingPayload = NO_PENDING_CANVAS_RENDER;

  const start = () => {
    activeRenderPromise = (async () => {
      while (pendingPayload !== NO_PENDING_CANVAS_RENDER) {
        const nextPayload = pendingPayload;
        pendingPayload = NO_PENDING_CANVAS_RENDER;
        await renderCanvas(nextPayload);
      }
    })().finally(() => {
      activeRenderPromise = undefined;
      if (pendingPayload !== NO_PENDING_CANVAS_RENDER) {
        start();
      }
    });

    return activeRenderPromise;
  };

  return (payload) => {
    pendingPayload = payload;
    if (!activeRenderPromise) {
      return start();
    }

    return activeRenderPromise;
  };
};

const createAssetLoadCache = () => ({
  sceneIds: new Set(),
  pendingSceneIds: new Set(),
  fileIds: new Set(),
  pendingFileLoads: new Map(),
});

let assetLoadCache = createAssetLoadCache();

const resetAssetLoadCache = () => {
  assetLoadCache = createAssetLoadCache();
};

const hasCachedSceneAsset = (deps, fileId) => {
  if (!fileId || !assetLoadCache.fileIds.has(fileId)) {
    return false;
  }

  const hasLoadedAsset = deps.graphicsService?.hasLoadedAsset;
  if (typeof hasLoadedAsset !== "function") {
    return true;
  }

  const isStillLoaded = hasLoadedAsset(fileId);
  if (!isStillLoaded) {
    assetLoadCache.fileIds.delete(fileId);
  }

  return isStillLoaded;
};

const findNonCloneablePaths = (root, limit = 5) => {
  const paths = [];
  const queue = [{ value: root, path: "$" }];
  const visited = new WeakSet();

  const isWindowLike = (value) =>
    typeof window !== "undefined" && value === window;
  const isNodeLike = (value) =>
    typeof Node !== "undefined" && value instanceof Node;
  const isEventLike = (value) =>
    typeof Event !== "undefined" && value instanceof Event;

  while (queue.length > 0 && paths.length < limit) {
    const { value, path } = queue.shift();

    if (!value || typeof value !== "object") {
      continue;
    }

    if (isWindowLike(value) || isNodeLike(value) || isEventLike(value)) {
      paths.push(path);
      continue;
    }

    if (visited.has(value)) {
      continue;
    }
    visited.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        queue.push({ value: item, path: `${path}[${index}]` });
      });
      continue;
    }

    Object.entries(value).forEach(([key, item]) => {
      queue.push({ value: item, path: `${path}.${key}` });
    });
  }

  return paths;
};

export const cloneWithDiagnostics = (value, label) => {
  try {
    return structuredClone(value);
  } catch (error) {
    if (error?.name === "DataCloneError") {
      const paths = findNonCloneablePaths(value);
      console.error(
        `[sceneEditor] Non-cloneable data in ${label}. Possible paths:`,
        paths.length > 0 ? paths : ["(path not detected)"],
      );
    }
    throw error;
  }
};

const setSceneAssetLoading = (deps, isLoading) => {
  const { store, render } = deps;
  store.setSceneAssetLoading({ isLoading });
  render();
};

async function createAssetsFromFileIds(
  fileReferences,
  projectService,
  resources,
) {
  const { sounds, images, videos = {}, fonts = {} } = resources;
  const resourceItemsByFileId = new Map(
    [
      ...Object.values(sounds || {}),
      ...Object.values(images || {}),
      ...Object.values(videos || {}),
      ...Object.values(fonts || {}),
    ]
      .filter((item) => item?.fileId)
      .map((item) => [item.fileId, item]),
  );

  const assets = {};
  for (const fileObj of fileReferences) {
    const { url: fileId } = fileObj;
    const foundItem = resourceItemsByFileId.get(fileId);

    try {
      const { url } = await projectService.getFileContent(fileId);
      const type = foundItem?.fileType ?? fileObj?.type;

      assets[fileId] = {
        url,
        type: type || "image/png",
      };
    } catch (error) {
      console.error(`Failed to load file ${fileId}:`, error);
    }
  }

  return assets;
}

async function loadAssetsForSceneIds(
  deps,
  projectData,
  sceneIds,
  { showLoading = true } = {},
) {
  const { graphicsService, projectService, appService } = deps;
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
    return (
      fileId &&
      !hasCachedSceneAsset(deps, fileId) &&
      !assetLoadCache.pendingFileLoads.has(fileId)
    );
  });
  const pendingFileIds = fileReferences
    .map((fileReference) => fileReference?.url)
    .filter((fileId) => assetLoadCache.pendingFileLoads.has(fileId));
  const isAnySceneUntracked = uniqueSceneIds.some(
    (sceneId) =>
      !assetLoadCache.sceneIds.has(sceneId) &&
      !assetLoadCache.pendingSceneIds.has(sceneId),
  );

  if (
    missingFileReferences.length === 0 &&
    pendingFileIds.length === 0 &&
    !isAnySceneUntracked
  ) {
    return;
  }

  const shouldShowLoading = showLoading && missingFileReferences.length > 0;
  let loadedAssetIds = [];
  const pendingLoadPromises = pendingFileIds
    .map((fileId) => assetLoadCache.pendingFileLoads.get(fileId))
    .filter(Boolean);
  const newFileIds = missingFileReferences
    .map((fileReference) => fileReference?.url)
    .filter(Boolean);

  try {
    uniqueSceneIds.forEach((sceneId) => {
      assetLoadCache.pendingSceneIds.add(sceneId);
    });

    if (shouldShowLoading) {
      setSceneAssetLoading(deps, true);
    }

    if (missingFileReferences.length > 0) {
      const nextLoadPromise = (async () => {
        const assets = await createAssetsFromFileIds(
          missingFileReferences,
          projectService,
          projectData.resources,
        );
        await graphicsService.loadAssets(assets);
        return Object.keys(assets);
      })();

      newFileIds.forEach((fileId) => {
        assetLoadCache.pendingFileLoads.set(fileId, nextLoadPromise);
      });

      loadedAssetIds = await nextLoadPromise.finally(() => {
        newFileIds.forEach((fileId) => {
          assetLoadCache.pendingFileLoads.delete(fileId);
        });
      });

      loadedAssetIds.forEach((fileId) => {
        assetLoadCache.fileIds.add(fileId);
      });
    }

    if (pendingLoadPromises.length > 0) {
      await Promise.all(pendingLoadPromises);
    }

    uniqueSceneIds.forEach((sceneId) => {
      assetLoadCache.pendingSceneIds.delete(sceneId);
      assetLoadCache.sceneIds.add(sceneId);
    });
  } catch (error) {
    uniqueSceneIds.forEach((sceneId) => {
      assetLoadCache.pendingSceneIds.delete(sceneId);
    });
    appService?.showAlert({
      message: "Failed to load some scene assets",
      title: "Warning",
    });
    console.error("[sceneEditor] Failed to load scene assets:", error);
  } finally {
    if (shouldShowLoading) {
      setSceneAssetLoading(deps, false);
    }
  }
}

async function preloadFileReferences(
  deps,
  fileReferences,
  { resources = {}, showLoading = false } = {},
) {
  if (!Array.isArray(fileReferences) || fileReferences.length === 0) {
    return;
  }

  const { graphicsService, projectService, appService } = deps;
  const missingFileReferences = fileReferences.filter((fileReference) => {
    const fileId = fileReference?.url;
    return (
      fileId &&
      !hasCachedSceneAsset(deps, fileId) &&
      !assetLoadCache.pendingFileLoads.has(fileId)
    );
  });
  const pendingFileIds = fileReferences
    .map((fileReference) => fileReference?.url)
    .filter((fileId) => assetLoadCache.pendingFileLoads.has(fileId));

  if (missingFileReferences.length === 0 && pendingFileIds.length === 0) {
    return;
  }

  const shouldShowLoading = showLoading && missingFileReferences.length > 0;
  const pendingLoadPromises = pendingFileIds
    .map((fileId) => assetLoadCache.pendingFileLoads.get(fileId))
    .filter(Boolean);
  const newFileIds = missingFileReferences
    .map((fileReference) => fileReference?.url)
    .filter(Boolean);

  try {
    if (shouldShowLoading) {
      setSceneAssetLoading(deps, true);
    }

    if (missingFileReferences.length > 0) {
      const nextLoadPromise = (async () => {
        const assets = await createAssetsFromFileIds(
          missingFileReferences,
          projectService,
          resources,
        );
        if (Object.keys(assets).length > 0) {
          await graphicsService.loadAssets?.(assets);
        }
        return Object.keys(assets);
      })();

      newFileIds.forEach((fileId) => {
        assetLoadCache.pendingFileLoads.set(fileId, nextLoadPromise);
      });

      const loadedAssetIds = await nextLoadPromise.finally(() => {
        newFileIds.forEach((fileId) => {
          assetLoadCache.pendingFileLoads.delete(fileId);
        });
      });

      loadedAssetIds.forEach((fileId) => {
        assetLoadCache.fileIds.add(fileId);
      });
    }

    if (pendingLoadPromises.length > 0) {
      await Promise.all(pendingLoadPromises);
    }
  } catch (error) {
    appService?.showAlert({
      message: "Failed to load some scene assets",
      title: "Warning",
    });
    console.error(
      "[sceneEditor] Failed to load temporary scene assets:",
      error,
    );
  } finally {
    if (shouldShowLoading) {
      setSceneAssetLoading(deps, false);
    }
  }
}

async function preloadDirectTransitionScenes(deps, projectData, sceneIds) {
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
}

async function preloadLayoutAssetsByIds(deps, projectData, layoutIds) {
  const uniqueLayoutIds = Array.from(new Set(layoutIds || [])).filter(
    (layoutId) => Boolean(projectData?.resources?.layouts?.[layoutId]),
  );

  if (uniqueLayoutIds.length === 0) {
    return;
  }

  const fileReferences = extractFileIdsForLayouts(projectData, uniqueLayoutIds);
  const missingFileReferences = fileReferences.filter((fileReference) => {
    const fileId = fileReference?.url;
    return (
      fileId &&
      !hasCachedSceneAsset(deps, fileId) &&
      !assetLoadCache.pendingFileLoads.has(fileId)
    );
  });
  const pendingFileIds = fileReferences
    .map((fileReference) => fileReference?.url)
    .filter((fileId) => assetLoadCache.pendingFileLoads.has(fileId));

  if (missingFileReferences.length === 0 && pendingFileIds.length === 0) {
    return;
  }

  const { graphicsService, projectService } = deps;
  const pendingLoadPromises = pendingFileIds
    .map((fileId) => assetLoadCache.pendingFileLoads.get(fileId))
    .filter(Boolean);
  const newFileIds = missingFileReferences
    .map((fileReference) => fileReference?.url)
    .filter(Boolean);
  let loadedFileIds = [];

  if (missingFileReferences.length > 0) {
    const nextLoadPromise = (async () => {
      const assets = await createAssetsFromFileIds(
        missingFileReferences,
        projectService,
        projectData.resources,
      );
      await graphicsService.loadAssets(assets);
      return Object.keys(assets);
    })();

    newFileIds.forEach((fileId) => {
      assetLoadCache.pendingFileLoads.set(fileId, nextLoadPromise);
    });

    loadedFileIds = await nextLoadPromise.finally(() => {
      newFileIds.forEach((fileId) => {
        assetLoadCache.pendingFileLoads.delete(fileId);
      });
    });

    loadedFileIds.forEach((fileId) => {
      assetLoadCache.fileIds.add(fileId);
    });
  }

  if (pendingLoadPromises.length > 0) {
    await Promise.all(pendingLoadPromises);
  }
}

const createBeforeHandleActionsHook = (deps) => {
  const { store } = deps;

  return async (actions, eventContext) => {
    const projectData = store.selectProjectData();
    const { eventData, preparedActions, resolvedActions } =
      await prepareRuntimeInteractionExecution({
        actions,
        eventContext,
        graphicsService: deps.graphicsService,
        canvasRoot: getCurrentCanvasRoot(deps.refs),
        resolveEventBindings,
      });
    const layoutIds = Array.from(
      new Set([
        ...extractLayoutIdsFromValue(resolvedActions, projectData),
        ...extractLayoutIdsFromValue(eventData, projectData),
      ]),
    );

    if (layoutIds.length > 0) {
      await preloadLayoutAssetsByIds(deps, projectData, layoutIds);
    }

    const transitionSceneIds = Array.from(
      new Set([
        ...extractTransitionTargetSceneIdsFromActions(
          resolvedActions,
          projectData,
        ),
        ...extractTransitionTargetSceneIdsFromActions(eventData, projectData),
        ...extractSceneIdsFromValue(resolvedActions, projectData),
        ...extractSceneIdsFromValue(eventData, projectData),
      ]),
    );

    if (transitionSceneIds.length === 0) {
      return preparedActions;
    }

    await loadAssetsForSceneIds(deps, projectData, transitionSceneIds, {
      showLoading: false,
    });
    await preloadDirectTransitionScenes(deps, projectData, transitionSceneIds);
    return preparedActions;
  };
};

const stripSelectedLinePreviewNavigation = (
  projectData,
  { sceneId, sectionId, lineId },
) => {
  if (!sceneId || !sectionId || !lineId) {
    return projectData;
  }

  const selectedScene = projectData?.story?.scenes?.[sceneId];
  const selectedSection = selectedScene?.sections?.[sectionId];
  const selectedLine = selectedSection?.lines?.find(
    (line) => line?.id === lineId,
  );

  if (!selectedLine?.actions?.sectionTransition) {
    return projectData;
  }

  delete selectedLine.actions.sectionTransition;
  return projectData;
};

const createProjectDataWithSelectedEntryPoint = (projectData, selection) => {
  const { sceneId, sectionId, lineId } = selection;
  const projectDataWithSelection = structuredClone(projectData);

  if (!sceneId || !projectDataWithSelection?.story?.scenes?.[sceneId]) {
    const sanitized = sanitizeProjectDataForRouteEngine(
      projectDataWithSelection,
    );
    return sanitized.projectData;
  }

  projectDataWithSelection.story.initialSceneId = sceneId;
  const selectedScene = projectDataWithSelection.story.scenes[sceneId];

  if (sectionId && selectedScene.sections?.[sectionId]) {
    selectedScene.initialSectionId = sectionId;

    if (lineId) {
      selectedScene.sections[sectionId].initialLineId = lineId;
    }
  }

  const sanitized = sanitizeProjectDataForRouteEngine(
    stripSelectedLinePreviewNavigation(projectDataWithSelection, selection),
  );
  return sanitized.projectData;
};

const initRouteEngineWithDiagnostics = (
  graphicsService,
  projectData,
  options = {},
) => {
  try {
    graphicsService.initRouteEngine(projectData, options);
  } catch (error) {
    console.error(
      "[sceneEditor] RouteEngine init failed",
      summarizeProjectDataForRouteEngine(projectData),
    );
    throw error;
  }
};

const toPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const selectTemporaryPresentationState = (store) => {
  return toPlainObject(store.selectTemporaryPresentationState?.());
};

const hasTemporaryPresentationState = (presentationState) => {
  return Object.keys(toPlainObject(presentationState)).length > 0;
};

const createProjectDataWithTemporaryPresentationState = (
  projectData,
  { sceneId, sectionId, lineId },
  temporaryPresentationState,
) => {
  if (!hasTemporaryPresentationState(temporaryPresentationState)) {
    return projectData;
  }

  const nextProjectData = structuredClone(projectData);
  const selectedSection =
    nextProjectData?.story?.scenes?.[sceneId]?.sections?.[sectionId];
  const selectedLine = selectedSection?.lines?.find(
    (line) => line?.id === lineId,
  );

  if (!selectedLine) {
    return projectData;
  }

  selectedLine.actions = {
    ...toPlainObject(selectedLine.actions),
    ...temporaryPresentationState,
  };

  return nextProjectData;
};

const prepareTemporaryPresentationProjectData = async (
  deps,
  projectData,
  selection,
  temporaryPresentationState,
) => {
  if (!hasTemporaryPresentationState(temporaryPresentationState)) {
    return projectData;
  }

  await preloadFileReferences(
    deps,
    extractFileIdsForValue(projectData, temporaryPresentationState),
    {
      resources: projectData?.resources,
      showLoading: false,
    },
  );

  return createProjectDataWithTemporaryPresentationState(
    projectData,
    selection,
    temporaryPresentationState,
  );
};

export const renderSceneEditorState = async (deps, payload = {}) => {
  const { store, graphicsService } = deps;
  const { skipAnimations = true, skipCanvasPaint = false } = payload;
  const perfEnabled = isDebugEnabled(SCENE_EDITOR_PERF_SCOPE);
  const renderStartedAt = perfEnabled ? getDebugNow() : 0;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  const projectDataProjectionStartedAt = perfEnabled ? getDebugNow() : 0;
  const projectedProjectData = store.selectProjectData();
  const projectDataProjectionDurationMs = perfEnabled
    ? getDebugDurationMs(projectDataProjectionStartedAt)
    : undefined;
  const projectDataSelectionStartedAt = perfEnabled ? getDebugNow() : 0;
  const selection = {
    sceneId,
    sectionId,
    lineId,
  };
  const projectData = createProjectDataWithSelectedEntryPoint(
    projectedProjectData,
    selection,
  );
  const projectDataSelectionDurationMs = perfEnabled
    ? getDebugDurationMs(projectDataSelectionStartedAt)
    : undefined;
  const isMuted = store.selectIsMuted();
  const backgroundTransformEditorOpen =
    store.selectIsBackgroundTransformEditorOpen?.() === true;
  graphicsService.setEngineAudioMuted?.(isMuted);
  graphicsService.setRuntimeInteractionsEnabled?.(
    !backgroundTransformEditorOpen,
  );

  const onRenderState = createRuntimeCurrentLineRenderStateHandler(deps);
  const engineInitStartedAt = perfEnabled ? getDebugNow() : 0;
  initRouteEngineWithDiagnostics(graphicsService, projectData, {
    enableGlobalKeyboardBindings: false,
    suppressRenderEffects: true,
    onRenderState,
  });
  const engineInitDurationMs = perfEnabled
    ? getDebugDurationMs(engineInitStartedAt)
    : undefined;
  const presentationStateStartedAt = perfEnabled ? getDebugNow() : 0;
  const presentationState = graphicsService.engineSelectPresentationState();
  store.setPresentationState({
    presentationState,
  });
  const presentationStateDurationMs = perfEnabled
    ? getDebugDurationMs(presentationStateStartedAt)
    : undefined;
  const temporaryPresentationState = selectTemporaryPresentationState(store);
  const temporaryCharacterItems =
    temporaryPresentationState?.character?.items ?? [];
  if (temporaryCharacterItems.length > 0) {
    logCharacterSpritesDebug("sceneEditor.runtime.temporary.selected", {
      selection,
      characterItems: summarizeCharacterSpriteActionItems(
        temporaryCharacterItems,
      ),
    });
  }

  const temporaryPresentationStateStartedAt = perfEnabled ? getDebugNow() : 0;
  let renderProjectData = await prepareTemporaryPresentationProjectData(
    deps,
    projectData,
    selection,
    temporaryPresentationState,
  );
  renderProjectData = createProjectDataWithBackgroundTransformEditor(
    renderProjectData,
    selection,
    store.selectBackgroundTransformEditor?.(),
  );
  const characterProjectSummary = summarizeCharacterSpriteProjectData({
    projectData: renderProjectData,
    selection,
  });
  if (characterProjectSummary.characterActionItems.length > 0) {
    logCharacterSpritesDebug("sceneEditor.runtime.renderProjectData", {
      summary: characterProjectSummary,
    });
  }
  const missingSpriteResources = characterProjectSummary.spriteResources.filter(
    (resource) => !resource.existsInResourcesImages,
  );
  if (
    characterProjectSummary.missingSpriteItems.length > 0 ||
    missingSpriteResources.length > 0
  ) {
    warnCharacterSpritesDebug("sceneEditor.runtime.characterSpritesInvalid", {
      summary: characterProjectSummary,
      missingSpriteResources,
    });
  }

  if (renderProjectData !== projectData) {
    initRouteEngineWithDiagnostics(graphicsService, renderProjectData, {
      enableGlobalKeyboardBindings: false,
      suppressRenderEffects: true,
      onRenderState,
    });
  }
  const temporaryPresentationStateDurationMs = perfEnabled
    ? getDebugDurationMs(temporaryPresentationStateStartedAt)
    : undefined;
  const renderStateSelectStartedAt = perfEnabled ? getDebugNow() : 0;
  const currentRenderState = graphicsService.engineSelectRenderState();
  const renderStateSummary = {
    elementCount: Array.isArray(currentRenderState?.elements)
      ? currentRenderState.elements.length
      : 0,
    animationCount: Array.isArray(currentRenderState?.animations)
      ? currentRenderState.animations.length
      : 0,
    audioCount: Array.isArray(currentRenderState?.audio)
      ? currentRenderState.audio.length
      : 0,
  };
  const renderStateSelectDurationMs = perfEnabled
    ? getDebugDurationMs(renderStateSelectStartedAt)
    : undefined;
  if (!currentRenderState) {
    if (perfEnabled) {
      debugLog(SCENE_EDITOR_PERF_SCOPE, "render-state.missing-render-state", {
        durationMs: getDebugDurationMs(renderStartedAt),
        sceneId,
        sectionId,
        lineId,
      });
    }
    return;
  }

  const activeAudioFileIds =
    payload?.skipAudio || isMuted
      ? []
      : (currentRenderState.audio || [])
          .map((audioElement) => audioElement?.src)
          .filter(Boolean);
  const audioLoadStartedAt = perfEnabled ? getDebugNow() : 0;
  await graphicsService.ensureAudioAssetsLoaded(activeAudioFileIds);
  const audioLoadDurationMs = perfEnabled
    ? getDebugDurationMs(audioLoadStartedAt)
    : undefined;

  let canvasPaintDurationMs = 0;
  if (!skipCanvasPaint) {
    await attachGraphicsCanvasToMountedRoot(deps, 2);
    const canvasPaintStartedAt = perfEnabled ? getDebugNow() : 0;
    if (backgroundTransformEditorOpen) {
      const backgroundTransformCanvasState =
        createBackgroundTransformEditorCanvasState({
          renderState: currentRenderState,
          graphicsService,
          editorState: store.selectBackgroundTransformEditor?.(),
        });
      store.setBackgroundTransformEditorSelectedElementMetrics?.({
        metrics: backgroundTransformCanvasState.selectedElementMetrics,
      });
      graphicsService.render(backgroundTransformCanvasState.renderState);
    } else {
      graphicsService.engineRenderCurrentState({
        skipAudio: isMuted,
        skipAnimations,
      });
    }
    if (perfEnabled) {
      canvasPaintDurationMs = getDebugDurationMs(canvasPaintStartedAt);
    }
  }

  const nextLineConfigStartedAt = perfEnabled ? getDebugNow() : 0;
  graphicsService.engineHandleActions(
    {
      setNextLineConfig: {
        auto: {
          enabled: false,
        },
      },
    },
    undefined,
    {
      suppressRenderEffects: true,
    },
  );
  const nextLineConfigDurationMs = perfEnabled
    ? getDebugDurationMs(nextLineConfigStartedAt)
    : undefined;

  if (perfEnabled) {
    debugLog(SCENE_EDITOR_PERF_SCOPE, "render-state.complete", {
      durationMs: getDebugDurationMs(renderStartedAt),
      sceneId,
      sectionId,
      lineId,
      skipAnimations,
      skipCanvasPaint,
      isMuted,
      projectDataProjectionDurationMs,
      projectDataSelectionDurationMs,
      engineInitDurationMs,
      renderStateSelectDurationMs,
      audioLoadDurationMs,
      canvasPaintDurationMs,
      nextLineConfigDurationMs,
      presentationStateDurationMs,
      temporaryPresentationStateDurationMs,
      elementCount: renderStateSummary.elementCount,
      animationCount: renderStateSummary.animationCount,
      audioCount: renderStateSummary.audioCount,
    });
  }
};

const getSceneSectionIds = (scene) => {
  const sectionIds = [];
  const seen = new Set();

  for (const section of scene?.sections || []) {
    if (!section?.id || seen.has(section.id)) {
      continue;
    }

    seen.add(section.id);
    sectionIds.push(section.id);
  }

  return sectionIds;
};

export const resolveSceneEditorEntrySelection = (scene, { sectionId } = {}) => {
  const sections = Array.isArray(scene?.sections) ? scene.sections : [];
  const selectedSection =
    sections.find((section) => section.id === sectionId) ||
    sections.find((section) => section.id === scene?.initialSectionId) ||
    sections[0];

  return {
    sectionId: selectedSection?.id,
    lineId: selectedSection?.lines?.[0]?.id,
  };
};

export const updateSceneEditorSectionChanges = async (deps) => {
  const { store, graphicsService } = deps;
  const selectedSectionId = store.selectSelectedSectionId();
  const sectionIds = getSceneSectionIds(store.selectScene?.());
  if (sectionIds.length === 0 && selectedSectionId) {
    sectionIds.push(selectedSectionId);
  }
  if (sectionIds.length === 0) {
    return;
  }

  const changesBySectionId = {};
  for (const sectionId of sectionIds) {
    changesBySectionId[sectionId] =
      graphicsService.engineSelectSectionLineChanges({
        sectionId,
        includePresentationState: true,
      });
  }

  if (store.setSectionLineChangesBySectionId) {
    store.setSectionLineChangesBySectionId({ changesBySectionId });
    return;
  }

  store.setSectionLineChanges({
    changes: selectedSectionId ? changesBySectionId[selectedSectionId] : {},
  });
};

export const initializeSceneEditorPage = async (deps) => {
  const {
    refs,
    graphicsService,
    store,
    projectService,
    appService,
    render,
    subject,
    syncProjectState,
  } = deps;
  await projectService.ensureRepository();

  const { s, sectionId: payloadSectionId } = appService.getPayload();
  const sceneId = s;

  await projectService.setActiveSceneId(sceneId);

  syncProjectState(store, projectService);

  store.setSceneId({ sceneId });

  const scene = store.selectScene();
  if (scene?.sections?.length > 0) {
    const entrySelection = resolveSceneEditorEntrySelection(scene, {
      sectionId: payloadSectionId,
    });
    store.setSelectedSectionId({
      selectedSectionId: entrySelection.sectionId,
    });
    store.setSelectedLineId({ selectedLineId: entrySelection.lineId });
  }

  resetAssetLoadCache("initialize scene editor");
  store.setSceneAssetLoading({ isLoading: false });

  const projectData = store.selectProjectData();
  const previewWidth = projectData?.screen?.width;
  const previewHeight = projectData?.screen?.height;

  const initialProjectData = createProjectDataWithSelectedEntryPoint(
    projectData,
    {
      sceneId,
      sectionId: store.selectSelectedSectionId(),
      lineId: store.selectSelectedLineId(),
    },
  );
  const initialSceneIds = extractInitialHybridSceneIds(projectData, sceneId);

  // Keep the loading overlay visible while mounting the real editor/canvas DOM.
  render();
  const mountedCanvasRoot = await waitForMountedCanvasRoot(refs);
  if (!mountedCanvasRoot?.isConnected) {
    throw new Error("Scene editor canvas failed to mount");
  }
  subject.dispatch("sceneEditor.canvasMounted", {
    canvasRoot: mountedCanvasRoot,
  });

  await graphicsService.init({
    canvas: mountedCanvasRoot,
    beforeHandleActions: createBeforeHandleActionsHook(deps),
    width: previewWidth,
    height: previewHeight,
  });

  await loadAssetsForSceneIds(deps, projectData, initialSceneIds, {
    showLoading: false,
  });

  void preloadDirectTransitionScenes(deps, initialProjectData, initialSceneIds);

  await renderSceneEditorState(deps, {
    skipAnimations: true,
  });
  await updateSceneEditorSectionChanges(deps);
  store.setScenePageLoading({ isLoading: false });
  render();

  setTimeout(() => {
    if (isSceneEditorPreviewVisible(store)) {
      return;
    }

    subject.dispatch("sceneEditor.renderCanvas", {});
  }, 1000);
};

export const restoreSceneEditorFromPreview = async (deps) => {
  const { store, render, graphicsService, refs } = deps;
  const sceneId = store.selectSceneId();

  store.hidePreviewScene();
  render();

  resetAssetLoadCache("restore scene editor from preview");
  store.setSceneAssetLoading({ isLoading: false });

  const projectData = store.selectProjectData();
  const previewWidth = projectData?.screen?.width;
  const previewHeight = projectData?.screen?.height;
  const mountedCanvasRoot = await waitForMountedCanvasRoot(refs);
  if (!mountedCanvasRoot?.isConnected) {
    throw new Error("Scene editor canvas failed to mount");
  }
  deps.subject.dispatch("sceneEditor.canvasMounted", {
    canvasRoot: mountedCanvasRoot,
  });
  await graphicsService.init({
    canvas: mountedCanvasRoot,
    beforeHandleActions: createBeforeHandleActionsHook(deps),
    width: previewWidth,
    height: previewHeight,
  });

  const initialProjectData = createProjectDataWithSelectedEntryPoint(
    projectData,
    {
      sceneId,
      sectionId: store.selectSelectedSectionId(),
      lineId: store.selectSelectedLineId(),
    },
  );
  const initialSceneIds = extractInitialHybridSceneIds(projectData, sceneId);

  await loadAssetsForSceneIds(deps, projectData, initialSceneIds, {
    showLoading: false,
  });
  void preloadDirectTransitionScenes(deps, projectData, initialSceneIds);
  const onRenderState = createRuntimeCurrentLineRenderStateHandler(deps);
  initRouteEngineWithDiagnostics(graphicsService, initialProjectData, {
    enableGlobalKeyboardBindings: false,
    onRenderState,
  });

  await renderSceneEditorState(deps);
};

export const renderSceneEditorCanvas = async (deps, payload) => {
  const { store, render } = deps;
  if (store.selectIsScenePageLoading()) {
    return;
  }

  if (isSceneEditorPreviewVisible(store)) {
    return;
  }

  const backgroundTransformEditorOpen =
    store.selectIsBackgroundTransformEditorOpen?.() === true;
  const mountedCanvasRoot = getCurrentCanvasRoot(deps.refs, {
    preferTransformEditorCanvas: backgroundTransformEditorOpen,
  });
  if (!mountedCanvasRoot?.isConnected) {
    return;
  }

  const perfEnabled = isDebugEnabled(SCENE_EDITOR_PERF_SCOPE);
  const renderStartedAt = perfEnabled ? getDebugNow() : 0;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  const projectData = createProjectDataWithSelectedEntryPoint(
    store.selectProjectData(),
    {
      sceneId,
      sectionId,
      lineId,
    },
  );
  const sceneIdsToLoad = extractInitialHybridSceneIds(projectData, sceneId);
  const shouldSyncPresentationState =
    payload?.skipRender === true && payload?.syncPresentationState === true;
  const previousPresentationStateSnapshot = shouldSyncPresentationState
    ? getPresentationStateSnapshot(store)
    : undefined;

  const sceneAssetLoadStartedAt = perfEnabled ? getDebugNow() : 0;
  await loadAssetsForSceneIds(deps, projectData, sceneIdsToLoad, {
    showLoading: false,
  });
  const sceneAssetLoadDurationMs = perfEnabled
    ? getDebugDurationMs(sceneAssetLoadStartedAt)
    : undefined;
  void preloadDirectTransitionScenes(deps, projectData, sceneIdsToLoad);

  const renderSceneStateStartedAt = perfEnabled ? getDebugNow() : 0;
  await renderSceneEditorState(deps, payload);
  const renderSceneStateDurationMs = perfEnabled
    ? getDebugDurationMs(renderSceneStateStartedAt)
    : undefined;
  const sectionChangesStartedAt = perfEnabled ? getDebugNow() : 0;
  await updateSceneEditorSectionChanges(deps);
  const sectionChangesDurationMs = perfEnabled
    ? getDebugDurationMs(sectionChangesStartedAt)
    : undefined;

  let uiRenderDurationMs = 0;
  const shouldRenderUi =
    !payload?.skipRender ||
    (shouldSyncPresentationState &&
      previousPresentationStateSnapshot !==
        getPresentationStateSnapshot(store));
  if (shouldRenderUi) {
    const uiRenderStartedAt = perfEnabled ? getDebugNow() : 0;
    render();
    if (perfEnabled) {
      uiRenderDurationMs = getDebugDurationMs(uiRenderStartedAt);
    }
  }

  if (perfEnabled) {
    debugLog(SCENE_EDITOR_PERF_SCOPE, "render-canvas.complete", {
      durationMs: getDebugDurationMs(renderStartedAt),
      sceneId,
      sectionId,
      lineId,
      skipRender: payload?.skipRender === true,
      skipAnimations: payload?.skipAnimations ?? true,
      skipCanvasPaint: payload?.skipCanvasPaint === true,
      sceneAssetLoadDurationMs,
      renderSceneStateDurationMs,
      sectionChangesDurationMs,
      uiRenderDurationMs,
      sceneIdsToLoad,
    });
  }
};

const flattenRefs = (value) => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenRefs(item));
  }

  if (typeof value === "object") {
    return [value];
  }

  return [];
};

const getRefElements = (refs) => {
  return Object.values(refs || {}).flatMap((entry) => flattenRefs(entry));
};

const findRuntimeSectionIdForLine = (store, lineId) => {
  if (!lineId) {
    return undefined;
  }

  return store
    .selectScene()
    ?.sections?.find((section) =>
      section.lines?.some((line) => line.id === lineId),
    )?.id;
};

const getRuntimeLinesEditorRef = (refs, { sectionId, lineId } = {}) => {
  const refElements = getRefElements(refs).filter(
    (element) => element?.scrollLineIntoView || element?.getLines,
  );

  if (sectionId) {
    const sectionEditor = refElements.find(
      (element) => element?.dataset?.sectionId === sectionId,
    );
    if (sectionEditor) {
      return sectionEditor;
    }
  }

  if (lineId) {
    const lineEditor = refElements.find((element) => {
      const lines = element?.getLines?.() || element?.lines;
      return Array.isArray(lines)
        ? lines.some((line) => line?.id === lineId)
        : false;
    });
    if (lineEditor) {
      return lineEditor;
    }
  }

  return refs?.linesEditor || refElements[0];
};

const scrollRuntimeLineIntoView = (refs, { sectionId, lineId } = {}) => {
  if (!lineId) {
    return;
  }

  getRuntimeLinesEditorRef(refs, { sectionId, lineId })?.scrollLineIntoView?.({
    lineId,
  });
};

const syncRuntimeCurrentLineSelection = (deps, payload = {}) => {
  const { refs, store, render } = deps;
  const { sectionId, lineId } = payload;
  const selectedSectionId = store.selectSelectedSectionId();
  const selectedLineId = store.selectSelectedLineId();

  if (!lineId) {
    return false;
  }

  const nextSectionId = sectionId || findRuntimeSectionIdForLine(store, lineId);
  if (!nextSectionId) {
    return false;
  }

  if (lineId === selectedLineId && nextSectionId === selectedSectionId) {
    return false;
  }

  const nextSection = store
    .selectScene()
    ?.sections?.find((section) => section.id === nextSectionId);
  const hasLine = nextSection?.lines?.some((line) => line.id === lineId);
  if (!hasLine) {
    return false;
  }

  if (nextSectionId !== selectedSectionId) {
    store.setSelectedSectionId({ selectedSectionId: nextSectionId });
  }
  store.setSelectedLineId({ selectedLineId: lineId });
  render();
  scrollRuntimeLineIntoView(refs, { sectionId: nextSectionId, lineId });
  return true;
};

const createCanvasRuntimeLineSyncGate = (store) => {
  let intent;

  const getExpectedLineId = ({ direction, lineId }) => {
    if (direction === "previous") {
      return store.selectPreviousLineId({ lineId });
    }

    return store.selectNextLineId({ lineId });
  };

  return {
    mark: ({ direction } = {}) => {
      if (direction !== "next" && direction !== "previous") {
        intent = undefined;
        return;
      }

      const lineIdAtInput = store.selectSelectedLineId();
      const sectionIdAtInput = store.selectSelectedSectionId();
      const expectedLineId = getExpectedLineId({
        direction,
        lineId: lineIdAtInput,
      });

      if (
        !lineIdAtInput ||
        !expectedLineId ||
        expectedLineId === lineIdAtInput
      ) {
        intent = undefined;
        return;
      }

      intent = {
        expectedLineId,
        expiresAt: Date.now() + CANVAS_RUNTIME_LINE_SYNC_WINDOW_MS,
        lineIdAtInput,
        sectionIdAtInput,
      };
    },
    shouldAllow: (payload = {}) => {
      if (!intent) {
        return false;
      }

      if (Date.now() > intent.expiresAt) {
        intent = undefined;
        return false;
      }

      const selectedLineId = store.selectSelectedLineId();
      const selectedSectionId = store.selectSelectedSectionId();
      if (
        selectedLineId !== intent.lineIdAtInput ||
        selectedSectionId !== intent.sectionIdAtInput
      ) {
        intent = undefined;
        return false;
      }

      if (payload.sectionId && payload.sectionId !== intent.sectionIdAtInput) {
        return false;
      }

      return payload.lineId === intent.expectedLineId;
    },
    consume: () => {
      intent = undefined;
    },
  };
};

const getCanvasRuntimeLineSyncDirection = (event) => {
  if (event?.deltaY < 0) {
    return "previous";
  }

  if (event?.deltaY > 0) {
    return "next";
  }

  return undefined;
};

const primeCanvasPointerHoverForWheel = (event) => {
  const target = event?.target;
  if (!target || typeof target.dispatchEvent !== "function") {
    return false;
  }

  if (typeof PointerEvent !== "function" && typeof MouseEvent !== "function") {
    return false;
  }

  const PointerMoveEvent =
    typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
  const pointerMoveEvent = new PointerMoveEvent("pointermove", {
    bubbles: true,
    button: 0,
    buttons: 0,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    composed: true,
    pointerId: 1,
    pointerType: "mouse",
    screenX: event.screenX,
    screenY: event.screenY,
  });

  target.dispatchEvent(pointerMoveEvent);
  return true;
};

const handleCanvasWheelFocusBlur = (deps, event) => {
  const inputFocused = deps.appService?.isInputFocused?.() === true;
  primeCanvasPointerHoverForWheel(event);

  if (!inputFocused) {
    return;
  }

  setTimeout(() => {
    deps.appService.blurActiveElement?.();
  }, 0);
};

const handleCanvasRollbackWheelFallback = async (deps, payload = {}) => {
  const { refs, store, render } = deps;
  if (store.selectIsBackgroundTransformEditorOpen?.()) {
    return;
  }
  const { lineIdAtWheel } = payload;
  const currentLineId = store.selectSelectedLineId();

  if (!lineIdAtWheel || currentLineId !== lineIdAtWheel) {
    return;
  }

  const previousLineId = store.selectPreviousLineId({
    lineId: currentLineId,
  });
  if (!previousLineId) {
    return;
  }

  store.setSelectedLineId({ selectedLineId: previousLineId });
  render();
  scrollRuntimeLineIntoView(refs, {
    sectionId: store.selectSelectedSectionId(),
    lineId: previousLineId,
  });
  await renderSceneEditorState(deps, {
    skipAnimations: true,
  });
};

const hasSelectedLineScreenTransition = (store) => {
  const selectedLine = store.selectSelectedLine?.();
  const lineActions = normalizeLineActions(selectedLine?.actions ?? {});
  return !!lineActions?.screen?.animations?.resourceId;
};

const handleCanvasForwardNavigationFallback = async (deps, payload = {}) => {
  const { refs, store, render } = deps;
  if (store.selectIsBackgroundTransformEditorOpen?.()) {
    return;
  }
  const { lineIdAtInput } = payload;
  const currentLineId = store.selectSelectedLineId();

  if (!lineIdAtInput || currentLineId !== lineIdAtInput) {
    return;
  }

  if (!hasSelectedLineScreenTransition(store)) {
    return;
  }

  const nextLineId = store.selectNextLineId({
    lineId: currentLineId,
  });
  if (!nextLineId || nextLineId === currentLineId) {
    return;
  }

  store.setSelectedLineId({ selectedLineId: nextLineId });
  render();
  scrollRuntimeLineIntoView(refs, {
    sectionId: store.selectSelectedSectionId(),
    lineId: nextLineId,
  });
  await renderSceneEditorState(deps, {
    skipAnimations: true,
  });
};

export const mountSceneEditorSubscriptions = (deps) => {
  const { subject } = deps;
  const canvasRuntimeLineSyncGate = createCanvasRuntimeLineSyncGate(deps.store);
  const queueRenderCanvas = createSceneEditorRenderQueue((payload) =>
    renderSceneEditorCanvas(deps, payload),
  );

  const streams = [
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.renderCanvas"),
      debounceTime(50),
      tap(async ({ payload }) => {
        await queueRenderCanvas(payload);
      }),
    ),
    subject.pipe(
      filter(
        ({ action }) => action === "sceneEditor.runtimeCurrentLineChanged",
      ),
      throttleTime(50, undefined, {
        leading: true,
        trailing: true,
      }),
      tap(({ payload }) => {
        if (!canvasRuntimeLineSyncGate.shouldAllow(payload)) {
          return;
        }

        if (syncRuntimeCurrentLineSelection(deps, payload)) {
          canvasRuntimeLineSyncGate.consume();
        }
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.canvasMounted"),
      switchMap(({ payload }) => {
        const canvasRoot = payload?.canvasRoot;
        if (!canvasRoot) {
          return EMPTY;
        }

        return fromEvent(canvasRoot, "wheel", {
          capture: true,
          passive: true,
        }).pipe(
          tap((event) => {
            canvasRuntimeLineSyncGate.mark({
              direction: getCanvasRuntimeLineSyncDirection(event),
            });
            handleCanvasWheelFocusBlur(deps, event);
          }),
        );
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.canvasMounted"),
      switchMap(({ payload }) => {
        const canvasRoot = payload?.canvasRoot;
        if (!canvasRoot) {
          return EMPTY;
        }

        return fromEvent(canvasRoot, "click", {
          capture: true,
        }).pipe(
          tap(() => {
            canvasRuntimeLineSyncGate.mark({ direction: "next" });
          }),
          map(() => ({
            lineIdAtInput: deps.store.selectSelectedLineId(),
          })),
          debounceTime(140),
          tap(async (payload) => {
            await handleCanvasForwardNavigationFallback(deps, payload);
          }),
        );
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.canvasMounted"),
      switchMap(({ payload }) => {
        const canvasRoot = payload?.canvasRoot;
        if (!canvasRoot) {
          return EMPTY;
        }

        return fromEvent(canvasRoot, "wheel", {
          capture: true,
          passive: true,
        }).pipe(
          filter((event) => event?.deltaY > 0),
          map(() => ({
            lineIdAtInput: deps.store.selectSelectedLineId(),
          })),
          debounceTime(140),
          tap(async (payload) => {
            await handleCanvasForwardNavigationFallback(deps, payload);
          }),
        );
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.canvasMounted"),
      switchMap(({ payload }) => {
        const canvasRoot = payload?.canvasRoot;
        if (!canvasRoot) {
          return EMPTY;
        }

        return fromEvent(canvasRoot, "wheel", {
          capture: true,
          passive: true,
        }).pipe(
          filter((event) => event?.deltaY < 0),
          map(() => ({
            lineIdAtWheel: deps.store.selectSelectedLineId(),
          })),
          debounceTime(120),
          tap(async (payload) => {
            await handleCanvasRollbackWheelFallback(deps, payload);
          }),
        );
      }),
    ),
  ];

  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const resetSceneEditorRuntime = async (deps) => {
  const { graphicsService, store } = deps;
  store.setSceneAssetLoading({ isLoading: false });
  resetAssetLoadCache("scene editor unmount");
  await graphicsService.destroy();
};
