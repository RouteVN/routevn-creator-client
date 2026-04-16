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

const getNow = () => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }

  return Date.now();
};

const getDurationMs = (startedAt) => Number((getNow() - startedAt).toFixed(2));

const countObjectKeys = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }

  return Object.keys(value).length;
};

const logSceneEditorPerf = (event, details = {}) => {
  console.info(`[sceneEditor.perf] ${event}`, details);
};

const SLOW_FILE_LOAD_MS = 200;

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
  const startedAt = getNow();
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
  const slowFileLoads = [];
  for (const fileObj of fileReferences) {
    const { url: fileId } = fileObj;
    const foundItem = resourceItemsByFileId.get(fileId);
    const fileStartedAt = getNow();

    try {
      const { url } = await projectService.getFileContent(fileId);
      const type = foundItem?.fileType ?? fileObj?.type;
      const fileDurationMs = getDurationMs(fileStartedAt);

      if (fileDurationMs >= SLOW_FILE_LOAD_MS) {
        slowFileLoads.push({
          fileId,
          fileDurationMs,
        });
      }

      assets[fileId] = {
        url,
        type: type || "image/png",
      };
    } catch (error) {
      console.error(`Failed to load file ${fileId}:`, error);
    }
  }

  logSceneEditorPerf("assets.resolveFileUrls.complete", {
    requestedFileCount: Array.isArray(fileReferences)
      ? fileReferences.length
      : 0,
    resolvedFileCount: Object.keys(assets).length,
    slowFileLoads,
    totalDurationMs: getDurationMs(startedAt),
  });

  return assets;
}

async function loadAssetsForSceneIds(
  deps,
  projectData,
  sceneIds,
  { showLoading = true } = {},
) {
  const loadStartedAt = getNow();
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

  logSceneEditorPerf("assets.load.start", {
    sceneCount: uniqueSceneIds.length,
    sceneIds: uniqueSceneIds,
    fileReferenceCount: fileReferences.length,
    missingFileCount: missingFileReferences.length,
    pendingFileCount: pendingFileIds.length,
    isAnySceneUntracked,
    showLoading,
  });

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
    logSceneEditorPerf("assets.load.complete", {
      sceneCount: uniqueSceneIds.length,
      sceneIds: uniqueSceneIds,
      fileReferenceCount: fileReferences.length,
      missingFileCount: missingFileReferences.length,
      pendingFileCount: pendingFileIds.length,
      loadedAssetCount: loadedAssetIds.length,
      totalDurationMs: getDurationMs(loadStartedAt),
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
    console.warn("[sceneEditor.perf] assets.load.failed", {
      sceneCount: uniqueSceneIds.length,
      sceneIds: uniqueSceneIds,
      fileReferenceCount: fileReferences.length,
      missingFileCount: missingFileReferences.length,
      pendingFileCount: pendingFileIds.length,
      totalDurationMs: getDurationMs(loadStartedAt),
      message: error?.message || "Unknown error",
    });
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
        canvasRoot: deps.refs?.canvas,
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
  const renderStartedAt = getNow();
  const { store, graphicsService } = deps;
  const { skipAnimations = false } = payload;
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
  const isMuted = store.selectIsMuted();

  const routeEngineInitStartedAt = getNow();
  initRouteEngineWithDiagnostics(graphicsService, projectData, {
    enableGlobalKeyboardBindings: false,
    suppressRenderEffects: true,
  });
  const routeEngineInitDurationMs = getDurationMs(routeEngineInitStartedAt);
  const currentRenderState = graphicsService.engineSelectRenderState();
  if (!currentRenderState) {
    logSceneEditorPerf("renderState.skipped", {
      reason: "missing-render-state",
      sceneId,
      sectionId,
      lineId,
      routeEngineInitDurationMs,
      totalDurationMs: getDurationMs(renderStartedAt),
    });
    return;
  }

  const activeAudioFileIds =
    payload?.skipAudio || isMuted
      ? []
      : (currentRenderState.audio || [])
          .map((audioElement) => audioElement?.src)
          .filter(Boolean);
  const ensureAudioStartedAt = getNow();
  await graphicsService.ensureAudioAssetsLoaded(activeAudioFileIds);
  const ensureAudioDurationMs = getDurationMs(ensureAudioStartedAt);
  const engineRenderStartedAt = getNow();
  graphicsService.engineRenderCurrentState({
    skipAudio: isMuted,
    skipAnimations,
  });
  const engineRenderDurationMs = getDurationMs(engineRenderStartedAt);
  const handleActionsStartedAt = getNow();
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
  const handleActionsDurationMs = getDurationMs(handleActionsStartedAt);

  const presentationState = graphicsService.engineSelectPresentationState();
  store.setPresentationState({
    presentationState,
  });
  logSceneEditorPerf("renderState.complete", {
    sceneId,
    sectionId,
    lineId,
    skipAnimations,
    activeAudioFileCount: activeAudioFileIds.length,
    routeEngineInitDurationMs,
    ensureAudioDurationMs,
    engineRenderDurationMs,
    handleActionsDurationMs,
    totalDurationMs: getDurationMs(renderStartedAt),
  });
};

export const updateSceneEditorSectionChanges = async (deps) => {
  const { store, graphicsService } = deps;
  const sectionId = store.selectSelectedSectionId();
  if (!sectionId) {
    return;
  }

  const changes = graphicsService.engineSelectSectionLineChanges({ sectionId });
  store.setSectionLineChanges({ changes });
};

export const initializeSceneEditorPage = async (deps) => {
  const initializeStartedAt = getNow();
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

  logSceneEditorPerf("initialize.start", {
    payload: appService.getPayload(),
  });

  const ensureRepositoryStartedAt = getNow();
  const repository = await projectService.ensureRepository();
  const ensureRepositoryDurationMs = getDurationMs(ensureRepositoryStartedAt);
  const ensuredProjectId =
    typeof projectService.getEnsuredProjectId === "function"
      ? projectService.getEnsuredProjectId()
      : undefined;
  if (
    ensuredProjectId &&
    typeof projectService.ensureCommandSessionForProject === "function"
  ) {
    void projectService
      .ensureCommandSessionForProject(ensuredProjectId)
      .catch(() => {});
  }

  const {
    s,
    sectionId: payloadSectionId,
    lineId: payloadLineId,
  } = appService.getPayload();
  const sceneId = s;

  if (typeof repository?.setActiveSceneId === "function") {
    const setActiveSceneStartedAt = getNow();
    await repository.setActiveSceneId(sceneId);
    logSceneEditorPerf("initialize.setActiveScene.complete", {
      sceneId,
      durationMs: getDurationMs(setActiveSceneStartedAt),
    });
  }

  const syncProjectStateStartedAt = getNow();
  syncProjectState(store, projectService);
  const syncProjectStateDurationMs = getDurationMs(syncProjectStateStartedAt);

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

  const graphicsInitStartedAt = getNow();
  await graphicsService.init({
    canvas: refs.canvas,
    beforeHandleActions: createBeforeHandleActionsHook(deps),
    width: previewWidth,
    height: previewHeight,
  });
  const graphicsInitDurationMs = getDurationMs(graphicsInitStartedAt);

  const initialProjectData = createProjectDataWithSelectedEntryPoint(
    projectData,
    {
      sceneId,
      sectionId: store.selectSelectedSectionId(),
      lineId: store.selectSelectedLineId(),
    },
  );
  const initialSceneIds = extractInitialHybridSceneIds(projectData, sceneId);

  const assetLoadStartedAt = getNow();
  await loadAssetsForSceneIds(deps, projectData, initialSceneIds, {
    showLoading: true,
  });
  const assetLoadDurationMs = getDurationMs(assetLoadStartedAt);
  void preloadDirectTransitionScenes(deps, projectData, initialSceneIds);
  const routeEngineInitStartedAt = getNow();
  initRouteEngineWithDiagnostics(graphicsService, initialProjectData, {
    enableGlobalKeyboardBindings: false,
  });
  const routeEngineInitDurationMs = getDurationMs(routeEngineInitStartedAt);

  const renderStartedAt = getNow();
  render();
  const renderDurationMs = getDurationMs(renderStartedAt);
  logSceneEditorPerf("initialize.complete", {
    sceneId,
    selectedSectionId: store.selectSelectedSectionId(),
    selectedLineId: store.selectSelectedLineId(),
    repositorySceneCount: countObjectKeys(
      projectData?.story?.scenes || projectData?.scenes?.items,
    ),
    resourceImageCount: countObjectKeys(projectData?.resources?.images),
    resourceSoundCount: countObjectKeys(projectData?.resources?.sounds),
    resourceVideoCount: countObjectKeys(projectData?.resources?.videos),
    resourceLayoutCount: countObjectKeys(projectData?.resources?.layouts),
    initialSceneIds,
    previewWidth,
    previewHeight,
    ensureRepositoryDurationMs,
    syncProjectStateDurationMs,
    graphicsInitDurationMs,
    assetLoadDurationMs,
    routeEngineInitDurationMs,
    renderDurationMs,
    totalDurationMs: getDurationMs(initializeStartedAt),
  });
  setTimeout(() => {
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
  await graphicsService.init({
    canvas: refs.canvas,
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
  initRouteEngineWithDiagnostics(graphicsService, initialProjectData, {
    enableGlobalKeyboardBindings: false,
  });

  await renderSceneEditorState(deps);
};

export const renderSceneEditorCanvas = async (deps, payload) => {
  const renderCanvasStartedAt = getNow();
  const { store, render } = deps;
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
  logSceneEditorPerf("renderCanvas.start", {
    sceneId,
    sectionId,
    lineId,
    sceneIdsToLoad,
    skipRender: Boolean(payload?.skipRender),
    skipAnimations: Boolean(payload?.skipAnimations),
  });

  const assetLoadStartedAt = getNow();
  await loadAssetsForSceneIds(deps, projectData, sceneIdsToLoad, {
    showLoading: false,
  });
  const assetLoadDurationMs = getDurationMs(assetLoadStartedAt);
  void preloadDirectTransitionScenes(deps, projectData, sceneIdsToLoad);

  const renderStateStartedAt = getNow();
  await renderSceneEditorState(deps, payload);
  const renderStateDurationMs = getDurationMs(renderStateStartedAt);
  const sectionChangesStartedAt = getNow();
  await updateSceneEditorSectionChanges(deps);
  const sectionChangesDurationMs = getDurationMs(sectionChangesStartedAt);

  if (!payload?.skipRender) {
    const renderStartedAt = getNow();
    render();
    logSceneEditorPerf("renderCanvas.complete", {
      sceneId,
      sectionId,
      lineId,
      sceneIdsToLoad,
      skipRender: Boolean(payload?.skipRender),
      skipAnimations: Boolean(payload?.skipAnimations),
      assetLoadDurationMs,
      renderStateDurationMs,
      sectionChangesDurationMs,
      renderDurationMs: getDurationMs(renderStartedAt),
      totalDurationMs: getDurationMs(renderCanvasStartedAt),
    });
    return;
  }

  logSceneEditorPerf("renderCanvas.complete", {
    sceneId,
    sectionId,
    lineId,
    sceneIdsToLoad,
    skipRender: Boolean(payload?.skipRender),
    skipAnimations: Boolean(payload?.skipAnimations),
    assetLoadDurationMs,
    renderStateDurationMs,
    sectionChangesDurationMs,
    totalDurationMs: getDurationMs(renderCanvasStartedAt),
  });
};

export const mountSceneEditorSubscriptions = (deps) => {
  const { subject } = deps;

  const streams = [
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.renderCanvas"),
      debounceTime(50),
      tap(async ({ payload }) => {
        await renderSceneEditorCanvas(deps, payload);
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
