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
const NO_PENDING_CANVAS_RENDER = Symbol("no-pending-canvas-render");

const logSceneEditorRuntime = (event, payload = {}) => {
  console.info("[sceneEditor.runtime]", {
    event,
    ...payload,
  });
};

const summarizeRepositoryStateForDiagnostics = (state) => {
  const scenes = state?.scenes?.items || {};
  const sceneItems = Object.values(scenes);
  const sectionItems = sceneItems.flatMap((scene) =>
    Object.values(scene?.sections?.items || {}),
  );
  const lineCount = sectionItems.reduce(
    (total, section) => total + Object.keys(section?.lines?.items || {}).length,
    0,
  );

  return {
    sceneCount: sceneItems.length,
    sectionCount: sectionItems.length,
    lineCount,
    initialSceneId: state?.story?.initialSceneId,
  };
};

const waitForNextFrame = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });

const waitForMountedCanvas = async (refs, maxFrames = 10) => {
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const canvas = refs?.canvas;
    if (canvas?.isConnected) {
      return canvas;
    }

    await waitForNextFrame();
  }

  return refs?.canvas;
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
  const { store, graphicsService } = deps;
  const { skipAnimations = false, skipCanvasPaint = false } = payload;
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

  initRouteEngineWithDiagnostics(graphicsService, projectData, {
    enableGlobalKeyboardBindings: false,
    suppressRenderEffects: true,
  });
  const currentRenderState = graphicsService.engineSelectRenderState();
  if (!currentRenderState) {
    return;
  }

  const activeAudioFileIds =
    payload?.skipAudio || isMuted
      ? []
      : (currentRenderState.audio || [])
          .map((audioElement) => audioElement?.src)
          .filter(Boolean);
  await graphicsService.ensureAudioAssetsLoaded(activeAudioFileIds);

  if (!skipCanvasPaint) {
    graphicsService.engineRenderCurrentState({
      skipAudio: isMuted,
      skipAnimations,
    });
  }
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

  const presentationState = graphicsService.engineSelectPresentationState();
  store.setPresentationState({
    presentationState,
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
  const ensuredProjectId = projectService.getEnsuredProjectId();

  const {
    s,
    sectionId: payloadSectionId,
    lineId: payloadLineId,
  } = appService.getPayload();
  const sceneId = s;

  logSceneEditorRuntime("initialize_start", {
    projectId: ensuredProjectId,
    sceneId,
    payloadSectionId,
    payloadLineId,
    repositoryRevision: projectService.getRepositoryRevision(),
    stateSummary: summarizeRepositoryStateForDiagnostics(
      projectService.getRepositoryState(),
    ),
  });

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

  await graphicsService.init({
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

  store.setScenePageLoading({ isLoading: false });
  render();
  const mountedCanvas = await waitForMountedCanvas(refs);
  if (!mountedCanvas?.isConnected) {
    throw new Error("Scene editor canvas failed to mount");
  }

  await graphicsService.attachCanvas(mountedCanvas);
  void preloadDirectTransitionScenes(deps, initialProjectData, initialSceneIds);
  subject.dispatch("sceneEditor.renderCanvas", {
    skipAnimations: true,
    skipCanvasPaint: true,
  });
  logSceneEditorRuntime("initialize_complete", {
    projectId: ensuredProjectId,
    sceneId,
    selectedSectionId: store.selectSelectedSectionId(),
    selectedLineId: store.selectSelectedLineId(),
    repositoryRevision: projectService.getRepositoryRevision(),
    stateSummary: summarizeRepositoryStateForDiagnostics(
      projectService.getRepositoryState(),
    ),
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
  const { store, render } = deps;
  if (store.selectIsScenePageLoading()) {
    return;
  }

  const mountedCanvas = deps.refs?.canvas;
  if (!mountedCanvas?.isConnected) {
    return;
  }

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

  await loadAssetsForSceneIds(deps, projectData, sceneIdsToLoad, {
    showLoading: false,
  });
  void preloadDirectTransitionScenes(deps, projectData, sceneIdsToLoad);

  await renderSceneEditorState(deps, payload);
  await updateSceneEditorSectionChanges(deps);

  if (!payload?.skipRender) {
    render();
  }
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
  logSceneEditorRuntime("reset_start", {
    sceneId: store.selectSceneId(),
    selectedSectionId: store.selectSelectedSectionId(),
    selectedLineId: store.selectSelectedLineId(),
  });
  store.setSceneAssetLoading({ isLoading: false });
  resetAssetLoadCache("scene editor unmount");
  await graphicsService.destroy();
  logSceneEditorRuntime("reset_complete", {
    sceneId: store.selectSceneId(),
  });
};
