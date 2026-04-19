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

const selectCurrentSectionId = (systemState = {}) => {
  const contexts = Array.isArray(systemState?.contexts)
    ? systemState.contexts
    : [];
  const currentContext = contexts[contexts.length - 1];
  const currentPointerMode = currentContext?.currentPointerMode;

  if (!currentPointerMode) {
    return undefined;
  }

  return currentContext?.pointers?.[currentPointerMode]?.sectionId;
};

const createSceneTargetPrefetcher = (
  deps,
  {
    repository,
    runtime,
    initialSceneId,
    initialSectionId,
    initialLineId,
  } = {},
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
        await loadAssetsForSceneIds(deps, runtime.projectData, transitionSceneIds, {
          showLoading: false,
        });
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
  {
    repository,
    runtime,
    sceneId,
    sectionId,
    lineId,
  } = {},
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
  const { dispatchEvent, store, graphicsService } = deps;
  function handleKeyDown(event) {
    if (event.key === "Escape") {
      dispatchEvent(new CustomEvent("close"));
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => {
    store.setAssetLoading({ isLoading: false });
    resetAssetLoadCache(store);
    void graphicsService.destroy?.();
    window.removeEventListener("keydown", handleKeyDown);
  };
};

export const handleAfterMount = async (deps) => {
  const { projectService, graphicsService, refs, props: attrs, store } = deps;
  const repository = await projectService.ensureRepository();
  const { canvas } = refs;
  graphicsService.setEngineAudioMuted?.(false);

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
      const currentSectionId = selectCurrentSectionId(systemState);
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
};
