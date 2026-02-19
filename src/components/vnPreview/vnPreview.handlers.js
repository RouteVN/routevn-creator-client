import { constructProjectData } from "../../utils/projectDataConstructor.js";
import {
  extractSceneIdsFromValue,
  extractFileIdsForScenes,
  extractInitialHybridSceneIds,
  resolveEventBindings,
  extractTransitionTargetSceneIds,
  extractTransitionTargetSceneIdsFromActions,
} from "../../utils/index.js";

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

const createAssetLoadCache = () => ({
  sceneIds: new Set(),
  fileIds: new Set(),
});

let assetLoadCache = createAssetLoadCache();

const resetAssetLoadCache = () => {
  assetLoadCache = createAssetLoadCache();
};

const setAssetLoading = (deps, isLoading) => {
  const { store, render } = deps;
  store.setAssetLoading(isLoading);
  render();
};

const logLoadedAssets = (sceneIds, fileReferences) => {
  if (!Array.isArray(fileReferences) || fileReferences.length === 0) {
    return;
  }

  console.log("[asset-load][vnPreview] loaded", {
    sceneIds,
    fileIds: fileReferences
      .map((fileReference) => fileReference?.url)
      .filter(Boolean),
  });
};

async function loadAssetsForSceneIds(
  deps,
  projectData,
  sceneIds,
  { showLoading = true } = {},
) {
  const { appService } = deps;
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
    return fileId && !assetLoadCache.fileIds.has(fileId);
  });
  const isAnySceneUntracked = uniqueSceneIds.some(
    (sceneId) => !assetLoadCache.sceneIds.has(sceneId),
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

      missingFileReferences.forEach((fileReference) => {
        if (fileReference?.url) {
          assetLoadCache.fileIds.add(fileReference.url);
        }
      });

      logLoadedAssets(uniqueSceneIds, missingFileReferences);
    }

    uniqueSceneIds.forEach((sceneId) => {
      assetLoadCache.sceneIds.add(sceneId);
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

const createBeforeHandleActionsHook = (deps, projectData) => {
  return async (actions, eventContext) => {
    const eventData = eventContext?._event;
    const resolvedActions = resolveEventBindings(actions, eventData);
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
      return;
    }

    console.log("[asset-load][vnPreview] transition preload", {
      transitionSceneIds,
      hasEventData: !!eventData,
    });

    await loadAssetsForSceneIds(deps, projectData, transitionSceneIds, {
      showLoading: false,
    });
    await preloadDirectTransitionScenes(deps, projectData, transitionSceneIds);
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
    store.setAssetLoading(false);
    resetAssetLoadCache();
    window.removeEventListener("keydown", handleKeyDown);
  };
};

export const handleAfterMount = async (deps) => {
  const { projectService, graphicsService, getRefIds, attrs, store } = deps;
  await projectService.ensureRepository();
  const state = projectService.getState();
  const { canvas } = getRefIds();

  const sceneId = attrs["scene-id"];
  const sectionId = attrs["section-id"];
  const lineId = attrs["line-id"];

  const projectData = constructProjectData(state, {
    initialSceneId: sceneId,
  });

  const projectDataWithInitial = structuredClone(projectData);
  const scene = projectDataWithInitial.story.scenes[sceneId];

  if (scene && sectionId && sectionId !== "undefined") {
    scene.initialSectionId = sectionId;

    if (lineId && lineId !== "undefined" && scene.sections[sectionId]) {
      scene.sections[sectionId].initialLineId = lineId;
    }
  }

  const beforeHandleActions = createBeforeHandleActionsHook(
    deps,
    projectDataWithInitial,
  );
  await graphicsService.init({
    canvas: canvas.elm,
    beforeHandleActions,
  });
  resetAssetLoadCache();
  store.setAssetLoading(false);

  const initialSceneIds = extractInitialHybridSceneIds(
    projectDataWithInitial,
    sceneId,
  );
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
