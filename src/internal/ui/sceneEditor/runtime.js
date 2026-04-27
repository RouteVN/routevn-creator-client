import { debounceTime, filter, tap } from "rxjs";
import {
  extractFileIdsForLayouts,
  extractFileIdsForScenes,
  extractInitialHybridSceneIds,
  extractLayoutIdsFromValue,
  extractSceneIdsFromValue,
  extractTransitionTargetSceneIds,
  extractTransitionTargetSceneIdsFromActions,
  resolveEventBindings,
} from "../../project/layout.js";
import {
  sanitizeProjectDataForRouteEngine,
  summarizeProjectDataForRouteEngine,
} from "../../project/routeEngineProjectData.js";
import { prepareRuntimeInteractionExecution } from "../../runtime/graphicsEngineRuntime.js";
import {
  debugLog,
  debugLogAlways as previewDebugLog,
  getDebugDurationMs,
  getDebugNow,
  isDebugEnabled,
} from "../../../deps/services/shared/debugLog.js";

const NO_PENDING_CANVAS_RENDER = Symbol("no-pending-canvas-render");
const SCENE_EDITOR_PERF_SCOPE = "scene-editor-perf";
const SCENE_EDITOR_PREVIEW_DEBUG_SCOPE = "scene-editor-preview";

const describeDomNode = (node) => {
  const rect =
    typeof node?.getBoundingClientRect === "function"
      ? node.getBoundingClientRect()
      : undefined;

  return {
    exists: Boolean(node),
    nodeName: node?.nodeName,
    id: node?.id,
    isConnected: node?.isConnected,
    childElementCount: node?.children?.length,
    parentNodeName: node?.parentNode?.nodeName,
    rect: rect
      ? {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      : undefined,
  };
};

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

const getCurrentCanvasRoot = (refs) => {
  const previewCanvasHost = refs?.previewCanvasHost;
  const canvasRoot =
    previewCanvasHost?.getCanvasRoot?.() ||
    previewCanvasHost?.shadowRoot?.querySelector?.("#canvas") ||
    previewCanvasHost?.querySelector?.("#canvas");

  if (canvasRoot?.isConnected) {
    return canvasRoot;
  }

  return canvasRoot;
};

const waitForMountedCanvasRoot = async (refs, maxFrames = 10) => {
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const canvasRoot = getCurrentCanvasRoot(refs);
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.canvas-wait.attempt",
      {
        attempt,
        maxFrames,
        previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
        canvasRoot: describeDomNode(canvasRoot),
      },
    );
    if (canvasRoot?.isConnected) {
      previewDebugLog(
        SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
        "scene-editor.canvas-wait.connected",
        {
          attempt,
          maxFrames,
          canvasRoot: describeDomNode(canvasRoot),
        },
      );
      return canvasRoot;
    }

    await waitForNextFrame();
  }

  const canvasRoot = getCurrentCanvasRoot(refs);
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.canvas-wait.exhausted",
    {
      maxFrames,
      previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
      canvasRoot: describeDomNode(canvasRoot),
    },
  );
  return canvasRoot;
};

const attachGraphicsCanvasToMountedRoot = async (deps, maxFrames = 10) => {
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.attach-canvas.start",
    {
      maxFrames,
      previewCanvasHost: describeDomNode(deps?.refs?.previewCanvasHost),
    },
  );
  const mountedCanvasRoot = await waitForMountedCanvasRoot(
    deps?.refs,
    maxFrames,
  );
  if (!mountedCanvasRoot?.isConnected) {
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.attach-canvas.skipped",
      {
        reason: "canvas-root-not-connected",
        mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
      },
    );
    return mountedCanvasRoot;
  }

  await deps?.graphicsService?.attachCanvas?.(mountedCanvasRoot);
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.attach-canvas.complete",
    {
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
    },
  );
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

export const renderSceneEditorState = async (deps, payload = {}) => {
  const { store, graphicsService } = deps;
  const { skipAnimations = false, skipCanvasPaint = false } = payload;
  const perfEnabled = isDebugEnabled(SCENE_EDITOR_PERF_SCOPE);
  const previewDebugStartedAt = getDebugNow();
  const renderStartedAt = perfEnabled ? getDebugNow() : 0;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.render-state.start",
    {
      sceneId,
      sectionId,
      lineId,
      skipAnimations,
      skipCanvasPaint,
      canvasRoot: describeDomNode(getCurrentCanvasRoot(deps.refs)),
    },
  );
  const projectDataProjectionStartedAt = perfEnabled ? getDebugNow() : 0;
  const projectedProjectData = store.selectProjectData();
  const projectDataProjectionDurationMs = perfEnabled
    ? getDebugDurationMs(projectDataProjectionStartedAt)
    : undefined;
  const projectDataSelectionStartedAt = perfEnabled ? getDebugNow() : 0;
  const projectData = createProjectDataWithSelectedEntryPoint(
    projectedProjectData,
    {
      sceneId,
      sectionId,
      lineId,
    },
  );
  const projectDataSelectionDurationMs = perfEnabled
    ? getDebugDurationMs(projectDataSelectionStartedAt)
    : undefined;
  const isMuted = store.selectIsMuted();
  graphicsService.setEngineAudioMuted?.(isMuted);

  const engineInitStartedAt = perfEnabled ? getDebugNow() : 0;
  initRouteEngineWithDiagnostics(graphicsService, projectData, {
    enableGlobalKeyboardBindings: false,
    suppressRenderEffects: true,
  });
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.render-state.engine-init",
    {
      durationMs: getDebugDurationMs(previewDebugStartedAt),
      sceneId,
      sectionId,
      lineId,
      projectInitialSceneId: projectData?.story?.initialSceneId,
    },
  );
  const engineInitDurationMs = perfEnabled
    ? getDebugDurationMs(engineInitStartedAt)
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
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.render-state.missing-render-state",
      {
        durationMs: getDebugDurationMs(previewDebugStartedAt),
        sceneId,
        sectionId,
        lineId,
        canvasRoot: describeDomNode(getCurrentCanvasRoot(deps.refs)),
      },
    );
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
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.render-state.paint-start",
      {
        durationMs: getDebugDurationMs(previewDebugStartedAt),
        sceneId,
        sectionId,
        lineId,
        canvasRoot: describeDomNode(getCurrentCanvasRoot(deps.refs)),
        renderStateSummary,
      },
    );
    graphicsService.engineRenderCurrentState({
      skipAudio: isMuted,
      skipAnimations,
    });
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.render-state.paint-complete",
      {
        durationMs: getDebugDurationMs(previewDebugStartedAt),
        sceneId,
        sectionId,
        lineId,
        canvasRoot: describeDomNode(getCurrentCanvasRoot(deps.refs)),
        renderStateSummary,
      },
    );
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

  const presentationStateStartedAt = perfEnabled ? getDebugNow() : 0;
  const presentationState = graphicsService.engineSelectPresentationState();
  store.setPresentationState({
    presentationState,
  });
  const presentationStateDurationMs = perfEnabled
    ? getDebugDurationMs(presentationStateStartedAt)
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
      elementCount: renderStateSummary.elementCount,
      animationCount: renderStateSummary.animationCount,
      audioCount: renderStateSummary.audioCount,
    });
  }
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.render-state.complete",
    {
      durationMs: getDebugDurationMs(previewDebugStartedAt),
      sceneId,
      sectionId,
      lineId,
      skipAnimations,
      skipCanvasPaint,
      isMuted,
      renderStateSummary,
      activeAudioFileIds,
      canvasRoot: describeDomNode(getCurrentCanvasRoot(deps.refs)),
    },
  );
};

export const updateSceneEditorSectionChanges = async (deps) => {
  const { store, graphicsService } = deps;
  const sectionId = store.selectSelectedSectionId();
  if (!sectionId) {
    return;
  }

  const changes = graphicsService.engineSelectSectionLineChanges({
    sectionId,
    includePresentationState: true,
  });
  store.setSectionLineChanges({ changes });
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
  const startedAt = getDebugNow();
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.initialize.start",
    {
      previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
      canvasRoot: describeDomNode(getCurrentCanvasRoot(refs)),
    },
  );
  await projectService.ensureRepository();

  const {
    s,
    sectionId: payloadSectionId,
    lineId: payloadLineId,
  } = appService.getPayload();
  const sceneId = s;

  await projectService.setActiveSceneId(sceneId);

  syncProjectState(store, projectService);

  store.setSceneId({ sceneId });

  const scene = store.selectScene();
  if (scene?.sections?.length > 0) {
    const selectedSection =
      scene.sections.find((section) => section.id === payloadSectionId) ||
      scene.sections[0];
    store.setSelectedSectionId({ selectedSectionId: selectedSection.id });

    if (selectedSection.lines?.length > 0) {
      const selectedLine =
        selectedSection.lines.find((line) => line.id === payloadLineId) ||
        selectedSection.lines[0];
      store.setSelectedLineId({ selectedLineId: selectedLine.id });
    } else {
      store.setSelectedLineId({ selectedLineId: undefined });
    }
  }

  resetAssetLoadCache("initialize scene editor");
  store.setSceneAssetLoading({ isLoading: false });

  const projectData = store.selectProjectData();
  const previewWidth = projectData?.screen?.width;
  const previewHeight = projectData?.screen?.height;
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.initialize.project-data-ready",
    {
      durationMs: getDebugDurationMs(startedAt),
      sceneId,
      sectionId: store.selectSelectedSectionId(),
      lineId: store.selectSelectedLineId(),
      previewWidth,
      previewHeight,
      previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
      canvasRoot: describeDomNode(getCurrentCanvasRoot(refs)),
    },
  );

  const initialProjectData = createProjectDataWithSelectedEntryPoint(
    projectData,
    {
      sceneId,
      sectionId: store.selectSelectedSectionId(),
      lineId: store.selectSelectedLineId(),
    },
  );
  const initialSceneIds = extractInitialHybridSceneIds(projectData, sceneId);

  store.setScenePageLoading({ isLoading: false });
  render();
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.initialize.rendered",
    {
      durationMs: getDebugDurationMs(startedAt),
      previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
      canvasRoot: describeDomNode(getCurrentCanvasRoot(refs)),
    },
  );
  const mountedCanvasRoot = await waitForMountedCanvasRoot(refs);
  if (!mountedCanvasRoot?.isConnected) {
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.initialize.canvas-missing",
      {
        durationMs: getDebugDurationMs(startedAt),
        mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
        previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
      },
    );
    throw new Error("Scene editor canvas failed to mount");
  }

  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.initialize.graphics-init.start",
    {
      durationMs: getDebugDurationMs(startedAt),
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
    },
  );
  await graphicsService.init({
    canvas: mountedCanvasRoot,
    beforeHandleActions: createBeforeHandleActionsHook(deps),
    width: previewWidth,
    height: previewHeight,
  });
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.initialize.graphics-init.complete",
    {
      durationMs: getDebugDurationMs(startedAt),
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
    },
  );

  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.initialize.asset-load.start",
    {
      durationMs: getDebugDurationMs(startedAt),
      initialSceneIds,
    },
  );
  await loadAssetsForSceneIds(deps, projectData, initialSceneIds, {
    showLoading: false,
  });
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.initialize.asset-load.complete",
    {
      durationMs: getDebugDurationMs(startedAt),
      initialSceneIds,
    },
  );

  void preloadDirectTransitionScenes(deps, initialProjectData, initialSceneIds);

  await renderSceneEditorState(deps, {
    skipAnimations: true,
  });
  await updateSceneEditorSectionChanges(deps);
  render();
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.initialize.complete",
    {
      durationMs: getDebugDurationMs(startedAt),
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
    },
  );

  setTimeout(() => {
    if (isSceneEditorPreviewVisible(store)) {
      previewDebugLog(
        SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
        "scene-editor.initialize.delayed-render-skipped",
        {
          durationMs: getDebugDurationMs(startedAt),
          reason: "fullscreen-preview-visible",
        },
      );
      return;
    }

    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.initialize.delayed-render-dispatch",
      {
        durationMs: getDebugDurationMs(startedAt),
      },
    );
    subject.dispatch("sceneEditor.renderCanvas", {});
  }, 1000);
};

export const restoreSceneEditorFromPreview = async (deps) => {
  const { store, render, graphicsService, refs } = deps;
  const startedAt = getDebugNow();
  const sceneId = store.selectSceneId();
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.restore.start",
    {
      sceneId,
      sectionId: store.selectSelectedSectionId(),
      lineId: store.selectSelectedLineId(),
      previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
      canvasRoot: describeDomNode(getCurrentCanvasRoot(refs)),
    },
  );

  store.hidePreviewScene();
  render();
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.restore.rendered",
    {
      durationMs: getDebugDurationMs(startedAt),
      previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
      canvasRoot: describeDomNode(getCurrentCanvasRoot(refs)),
    },
  );

  resetAssetLoadCache("restore scene editor from preview");
  store.setSceneAssetLoading({ isLoading: false });

  const projectData = store.selectProjectData();
  const previewWidth = projectData?.screen?.width;
  const previewHeight = projectData?.screen?.height;
  const mountedCanvasRoot = await waitForMountedCanvasRoot(refs);
  if (!mountedCanvasRoot?.isConnected) {
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.restore.canvas-missing",
      {
        durationMs: getDebugDurationMs(startedAt),
        mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
        previewCanvasHost: describeDomNode(refs?.previewCanvasHost),
      },
    );
    throw new Error("Scene editor canvas failed to mount");
  }
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.restore.graphics-init.start",
    {
      durationMs: getDebugDurationMs(startedAt),
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
      previewWidth,
      previewHeight,
    },
  );
  await graphicsService.init({
    canvas: mountedCanvasRoot,
    beforeHandleActions: createBeforeHandleActionsHook(deps),
    width: previewWidth,
    height: previewHeight,
  });
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.restore.graphics-init.complete",
    {
      durationMs: getDebugDurationMs(startedAt),
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
    },
  );

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
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.restore.asset-load.complete",
    {
      durationMs: getDebugDurationMs(startedAt),
      initialSceneIds,
    },
  );
  void preloadDirectTransitionScenes(deps, projectData, initialSceneIds);
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.restore.route-engine-init.start",
    {
      durationMs: getDebugDurationMs(startedAt),
      initialSceneIds,
    },
  );
  initRouteEngineWithDiagnostics(graphicsService, initialProjectData, {
    enableGlobalKeyboardBindings: false,
  });

  await renderSceneEditorState(deps);
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.restore.complete",
    {
      durationMs: getDebugDurationMs(startedAt),
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
    },
  );
};

export const renderSceneEditorCanvas = async (deps, payload) => {
  const { store, render } = deps;
  if (store.selectIsScenePageLoading()) {
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.render-canvas.skipped",
      {
        reason: "scene-page-loading",
        payload,
      },
    );
    return;
  }

  if (isSceneEditorPreviewVisible(store)) {
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.render-canvas.skipped",
      {
        reason: "fullscreen-preview-visible",
        payload,
        preview: store.selectPreviewScene?.(),
      },
    );
    return;
  }

  const mountedCanvasRoot = getCurrentCanvasRoot(deps.refs);
  if (!mountedCanvasRoot?.isConnected) {
    previewDebugLog(
      SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
      "scene-editor.render-canvas.skipped",
      {
        reason: "canvas-root-not-connected",
        payload,
        previewCanvasHost: describeDomNode(deps.refs?.previewCanvasHost),
        mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
      },
    );
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
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.render-canvas.start",
    {
      sceneId,
      sectionId,
      lineId,
      payload,
      sceneIdsToLoad,
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
    },
  );

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
  if (!payload?.skipRender) {
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
      skipAnimations: payload?.skipAnimations === true,
      skipCanvasPaint: payload?.skipCanvasPaint === true,
      sceneAssetLoadDurationMs,
      renderSceneStateDurationMs,
      sectionChangesDurationMs,
      uiRenderDurationMs,
      sceneIdsToLoad,
    });
  }
  previewDebugLog(
    SCENE_EDITOR_PREVIEW_DEBUG_SCOPE,
    "scene-editor.render-canvas.complete",
    {
      sceneId,
      sectionId,
      lineId,
      payload,
      sceneIdsToLoad,
      mountedCanvasRoot: describeDomNode(mountedCanvasRoot),
    },
  );
};

export const mountSceneEditorSubscriptions = (deps) => {
  const { subject } = deps;
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
