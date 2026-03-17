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
import { writeDialogueContent } from "./lineOperations.js";

const createAssetLoadCache = () => ({
  sceneIds: new Set(),
  fileIds: new Set(),
});

let assetLoadCache = createAssetLoadCache();

const resetAssetLoadCache = () => {
  assetLoadCache = createAssetLoadCache();
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
  const allItems = Object.entries({
    ...sounds,
    ...images,
    ...videos,
    ...fonts,
  }).map(([key, value]) => ({
    id: key,
    ...value,
  }));

  const assets = {};
  for (const fileObj of fileReferences) {
    const { url: fileId } = fileObj;
    const foundItem = allItems.find((item) => item.fileId === fileId);

    try {
      const { url } = await projectService.getFileContent(fileId);
      let type = foundItem?.fileType;

      if (!type) {
        Object.entries(sounds.items || {})
          .concat(Object.entries(images.items || {}))
          .concat(Object.entries(videos.items || {}))
          .concat(Object.entries(fonts.items || {}))
          .forEach(([_key, item]) => {
            if (item.fileId === fileId) {
              type = item.fileType;
            }
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
      setSceneAssetLoading(deps, true);
    }

    if (missingFileReferences.length > 0) {
      const assets = await createAssetsFromFileIds(
        missingFileReferences,
        projectService,
        projectData.resources,
      );
      await graphicsService.loadAssets(assets);

      Object.keys(assets).forEach((fileId) => {
        if (fileId) {
          assetLoadCache.fileIds.add(fileId);
        }
      });
    }

    uniqueSceneIds.forEach((sceneId) => {
      assetLoadCache.sceneIds.add(sceneId);
    });
  } catch (error) {
    appService?.showToast("Failed to load some scene assets", {
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
    return fileId && !assetLoadCache.fileIds.has(fileId);
  });

  if (missingFileReferences.length === 0) {
    return;
  }

  const { graphicsService, projectService } = deps;
  const assets = await createAssetsFromFileIds(
    missingFileReferences,
    projectService,
    projectData.resources,
  );
  await graphicsService.loadAssets(assets);

  Object.keys(assets).forEach((fileId) => {
    if (fileId) {
      assetLoadCache.fileIds.add(fileId);
    }
  });
}

const createBeforeHandleActionsHook = (deps) => {
  const { store } = deps;

  return async (actions, eventContext) => {
    const projectData = store.selectProjectData();
    const eventData = eventContext?._event;
    const resolvedActions = resolveEventBindings(actions, eventData);
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
      return;
    }

    await loadAssetsForSceneIds(deps, projectData, transitionSceneIds, {
      showLoading: false,
    });
    await preloadDirectTransitionScenes(deps, projectData, transitionSceneIds);
  };
};

const createProjectDataWithSelectedEntryPoint = (projectData, selection) => {
  const { sceneId, sectionId, lineId } = selection;
  const projectDataWithSelection = structuredClone(projectData);

  if (!sceneId || !projectDataWithSelection?.story?.scenes?.[sceneId]) {
    return projectDataWithSelection;
  }

  projectDataWithSelection.story.initialSceneId = sceneId;
  const selectedScene = projectDataWithSelection.story.scenes[sceneId];

  if (sectionId && selectedScene.sections?.[sectionId]) {
    selectedScene.initialSectionId = sectionId;

    if (lineId) {
      selectedScene.sections[sectionId].initialLineId = lineId;
    }
  }

  return projectDataWithSelection;
};

export const renderSceneEditorState = async (deps, payload = {}) => {
  const { store, graphicsService } = deps;
  const { skipAnimations = false } = payload;
  const projectData = store.selectProjectData();
  const safeProjectData = cloneWithDiagnostics(
    projectData,
    "projectData passed to updateProjectData",
  );
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  const isMuted = store.selectIsMuted();

  graphicsService.engineHandleActions({
    updateProjectData: {
      projectData: safeProjectData,
    },
    jumpToLine: {
      sectionId,
      lineId,
    },
  });
  graphicsService.engineRenderCurrentState({
    skipAudio: isMuted,
    skipAnimations,
  });
  graphicsService.engineHandleActions({
    setNextLineConfig: {
      auto: {
        enabled: false,
      },
    },
  });

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

  const {
    s,
    sectionId: payloadSectionId,
    lineId: payloadLineId,
  } = appService.getPayload();
  const sceneId = s;
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

  resetAssetLoadCache();
  store.setSceneAssetLoading({ isLoading: false });

  await graphicsService.init({
    canvas: refs.canvas,
    beforeHandleActions: createBeforeHandleActionsHook(deps),
  });

  const projectData = store.selectProjectData();
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
    showLoading: true,
  });
  void preloadDirectTransitionScenes(deps, projectData, initialSceneIds);
  graphicsService.initRouteEngine(initialProjectData);

  render();
  setTimeout(() => {
    subject.dispatch("sceneEditor.renderCanvas", {});
  }, 1000);
};

export const restoreSceneEditorFromPreview = async (deps) => {
  const { store, render, graphicsService, refs } = deps;

  store.hidePreviewScene();
  render();

  resetAssetLoadCache();
  store.setSceneAssetLoading({ isLoading: false });
  await graphicsService.init({
    canvas: refs.canvas,
    beforeHandleActions: createBeforeHandleActionsHook(deps),
  });

  const projectData = store.selectProjectData();
  const sceneId = store.selectSceneId();
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
  graphicsService.initRouteEngine(initialProjectData);

  await renderSceneEditorState(deps);
};

export const renderSceneEditorCanvas = async (deps, payload) => {
  const { store, render } = deps;
  const projectData = store.selectProjectData();
  const sceneId = store.selectSceneId();
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
  const { subject, dialogueQueueService } = deps;

  dialogueQueueService.onWrite(async (lineId, data) => {
    await writeDialogueContent(deps, lineId, data);
  });

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

export const resetSceneEditorRuntime = (deps) => {
  const { graphicsService, store } = deps;
  store.setSceneAssetLoading({ isLoading: false });
  resetAssetLoadCache();
  graphicsService.destroy();
};
