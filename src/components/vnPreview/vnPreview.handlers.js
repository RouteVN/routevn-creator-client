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
    appService?.showToast("Failed to load some preview assets", {
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

const createBeforeHandleActionsHook = (
  deps,
  { repository, projectData, sceneId, sectionId, lineId } = {},
) => {
  let currentProjectData = projectData;
  let loadedSceneIds = new Set(
    typeof sceneId === "string" && sceneId.length > 0
      ? [sceneId]
      : Object.keys(projectData?.story?.scenes || {}),
  );

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
    const missingSceneIds = referencedSceneIds.filter(
      (targetSceneId) => !loadedSceneIds.has(targetSceneId),
    );
    const missingSectionIds = [];

    referencedSectionIds.forEach((targetSectionId) => {
      const targetSceneId = resolveSceneIdForSectionId(
        currentProjectData,
        targetSectionId,
      );

      if (!targetSceneId) {
        missingSectionIds.push(targetSectionId);
        return;
      }

      if (!loadedSceneIds.has(targetSceneId)) {
        missingSceneIds.push(targetSceneId);
      }
    });

    const shouldShowLoading =
      missingSceneIds.length > 0 || missingSectionIds.length > 0;

    if (shouldShowLoading) {
      setAssetLoading(deps, true);
    }

    try {
      if (shouldShowLoading) {
        const hydrationResult = await ensurePreviewProjectDataTargets({
          repository,
          projectData: currentProjectData,
          loadedSceneIds: Array.from(loadedSceneIds),
          sceneIds: missingSceneIds,
          sectionIds: missingSectionIds,
          initialSceneId: sceneId,
          initialSectionId: sectionId,
          initialLineId: lineId,
        });

        if (hydrationResult.didLoad) {
          currentProjectData = hydrationResult.projectData;
          loadedSceneIds = new Set(hydrationResult.loadedSceneIds);
          deps.graphicsService.engineHandleActions(
            {
              updateProjectData: {
                projectData: currentProjectData,
              },
            },
            undefined,
            {
              suppressRenderEffects: true,
            },
          );
        }
      }

      const layoutIds = Array.from(
        new Set([
          ...extractLayoutIdsFromValue(resolvedActions, currentProjectData),
          ...extractLayoutIdsFromValue(eventData, currentProjectData),
        ]),
      );
      if (layoutIds.length > 0) {
        await preloadLayoutAssetsByIds(deps, currentProjectData, layoutIds);
      }

      const transitionSceneIds = Array.from(
        new Set([
          ...extractTransitionTargetSceneIdsFromActions(
            resolvedActions,
            currentProjectData,
          ),
          ...extractTransitionTargetSceneIdsFromActions(
            eventData,
            currentProjectData,
          ),
          ...extractSceneIdsFromValue(resolvedActions, currentProjectData),
          ...extractSceneIdsFromValue(eventData, currentProjectData),
        ]),
      );

      if (transitionSceneIds.length === 0) {
        return preparedActions;
      }

      await loadAssetsForSceneIds(
        deps,
        currentProjectData,
        transitionSceneIds,
        {
          showLoading: false,
        },
      );
      await preloadDirectTransitionScenes(
        deps,
        currentProjectData,
        transitionSceneIds,
      );
      return preparedActions;
    } finally {
      if (shouldShowLoading) {
        setAssetLoading(deps, false);
      }
    }
  };
};

export const handleBeforeMount = (deps) => {
  const { dispatchEvent, store } = deps;
  function handleKeyDown(event) {
    if (event.key === "Escape") {
      dispatchEvent(new CustomEvent("close"));
    }
  }

  window.addEventListener("keydown", handleKeyDown);
  return () => {
    store.setAssetLoading({ isLoading: false });
    resetAssetLoadCache(store);
    window.removeEventListener("keydown", handleKeyDown);
  };
};

export const handleAfterMount = async (deps) => {
  const { projectService, graphicsService, refs, props: attrs, store } = deps;
  const repository = await projectService.ensureRepository();
  const { canvas } = refs;

  const sceneId = attrs.sceneId;
  const sectionId = attrs.sectionId;
  const lineId = attrs.lineId;

  const state =
    typeof repository?.getContextState === "function" &&
    typeof sceneId === "string" &&
    sceneId.length > 0
      ? await repository.getContextState({
          sceneIds: [sceneId],
        })
      : projectService.getRepositoryState();

  const projectData = constructProjectData(state, {
    initialSceneId: sceneId,
  });

  const projectDataWithInitial = withPreviewEntryPoint(projectData, {
    sceneId,
    sectionId,
    lineId,
  });
  const initialSceneIds = extractInitialHybridSceneIds(
    projectDataWithInitial,
    sceneId,
  );

  const beforeHandleActions = createBeforeHandleActionsHook(deps, {
    repository,
    projectData: projectDataWithInitial,
    sceneId,
    sectionId,
    lineId,
  });
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
  await graphicsService.initRouteEngine(projectDataWithInitial, {
    handleEffects: true,
  });
};
