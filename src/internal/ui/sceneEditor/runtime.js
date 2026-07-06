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
  extractFileIdsFromRenderState,
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
import { selectSceneEditorCopy } from "./sceneEditorCopy.js";
import {
  emitSceneEditorTiming,
  shouldMeasureSceneEditorTiming,
} from "./sceneEditorTiming.js";

const NO_PENDING_CANVAS_RENDER = Symbol("no-pending-canvas-render");
const SCENE_EDITOR_PERF_SCOPE = "scene-editor-perf";
const CANVAS_RUNTIME_LINE_SYNC_WINDOW_MS = 1200;
const FAILED_SCENE_ASSET_RETRY_DELAY_MS = 60000;

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
  failedFileLoads: new Map(),
});

let assetLoadCache = createAssetLoadCache();

const resetAssetLoadCache = () => {
  assetLoadCache = createAssetLoadCache();
};

const getAssetLoadTimestamp = () => getDebugNow();

const getErrorMessage = (error) => {
  if (typeof error?.message === "string" && error.message.length > 0) {
    return error.message;
  }

  return String(error ?? "Unknown asset load error");
};

const clearExpiredFailedSceneAsset = (fileId) => {
  const failure = assetLoadCache.failedFileLoads.get(fileId);
  if (!failure) {
    return false;
  }

  const failedAtMs = Number(failure.failedAtMs);
  if (
    Number.isFinite(failedAtMs) &&
    getAssetLoadTimestamp() - failedAtMs < FAILED_SCENE_ASSET_RETRY_DELAY_MS
  ) {
    return true;
  }

  assetLoadCache.failedFileLoads.delete(fileId);
  return false;
};

const markSceneAssetsLoaded = (fileIds = []) => {
  fileIds.forEach((fileId) => {
    if (!fileId) {
      return;
    }
    assetLoadCache.fileIds.add(fileId);
    assetLoadCache.failedFileLoads.delete(fileId);
  });
};

const markSceneAssetLoadFailures = (failures = []) => {
  failures.forEach(({ fileId, error }) => {
    if (!fileId) {
      return;
    }
    assetLoadCache.fileIds.delete(fileId);
    assetLoadCache.failedFileLoads.set(fileId, {
      failedAtMs: getAssetLoadTimestamp(),
      message: getErrorMessage(error),
    });
  });
};

const getResourceItemsByFileId = (resources = {}) => {
  const { sounds, images, videos = {}, voices = {}, fonts = {} } = resources;
  const voiceItems = Object.values(voices || {}).flatMap((sceneVoices) =>
    Object.values(sceneVoices || {}),
  );

  return new Map(
    [
      ...Object.values(sounds || {}),
      ...voiceItems,
      ...Object.values(images || {}),
      ...Object.values(videos || {}),
      ...Object.values(fonts || {}),
    ]
      .filter((item) => item?.fileId)
      .map((item) => [item.fileId, item]),
  );
};

const resolveFileReferenceType = (
  fileReference,
  resourceItemsByFileId = new Map(),
) => {
  const resourceType = resourceItemsByFileId.get(fileReference?.url)?.fileType;
  if (typeof resourceType === "string" && resourceType.length > 0) {
    return resourceType;
  }

  return fileReference?.type;
};

const isAudioAssetReference = (fileReference, resourceItemsByFileId) => {
  const type = resolveFileReferenceType(fileReference, resourceItemsByFileId);
  return (
    typeof type === "string" &&
    (type.startsWith("audio/") || type === "audio/*")
  );
};

const hasCachedSceneAsset = (deps, fileReference, resourceItemsByFileId) => {
  const fileId = fileReference?.url;
  if (!fileId || !assetLoadCache.fileIds.has(fileId)) {
    return false;
  }

  if (isAudioAssetReference(fileReference, resourceItemsByFileId)) {
    return true;
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

const getUniqueFileIdsFromReferences = (fileReferences = []) => {
  return Array.from(
    new Set(fileReferences.map((fileReference) => fileReference?.url)),
  ).filter(Boolean);
};

const selectFileReferencesForAssetLoad = (
  deps,
  fileReferences = [],
  resources = {},
) => {
  const resourceItemsByFileId = getResourceItemsByFileId(resources);
  const skippedFailedFileIds = new Set();
  const missingFileReferences = fileReferences.filter((fileReference) => {
    const fileId = fileReference?.url;
    if (!fileId) {
      return false;
    }

    if (clearExpiredFailedSceneAsset(fileId)) {
      skippedFailedFileIds.add(fileId);
      return false;
    }

    return (
      !hasCachedSceneAsset(deps, fileReference, resourceItemsByFileId) &&
      !assetLoadCache.pendingFileLoads.has(fileId)
    );
  });

  return {
    missingFileReferences,
    skippedFailedFileIds: Array.from(skippedFailedFileIds),
  };
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
  const resourceItemsByFileId = getResourceItemsByFileId(resources);

  const assets = {};
  for (const fileObj of fileReferences) {
    const { url: fileId } = fileObj;
    const foundItem = resourceItemsByFileId.get(fileId);

    try {
      const result = await projectService.getFileContent(fileId);
      const type = foundItem?.fileType ?? result.type ?? fileObj?.type;

      assets[fileId] = {
        url: result.url,
        type: type || "image/png",
      };
    } catch (error) {
      console.error(`Failed to load file ${fileId}:`, error);
    }
  }

  return assets;
}

const isVideoAsset = (asset) => {
  return typeof asset?.type === "string" && asset.type.startsWith("video/");
};

const splitAssetEntriesForLoading = (assets = {}) => {
  const entries = Object.entries(assets);
  return {
    primaryEntries: entries.filter(([, asset]) => !isVideoAsset(asset)),
    videoEntries: entries.filter(([, asset]) => isVideoAsset(asset)),
  };
};

const entriesToAssets = (entries = []) => Object.fromEntries(entries);

const loadAssetEntriesAsGroup = async (
  graphicsService,
  entries,
  { isolateFailures = false } = {},
) => {
  if (entries.length === 0) {
    return {
      loadedAssetIds: [],
      failedAssetLoads: [],
    };
  }

  try {
    await graphicsService.loadAssets(entriesToAssets(entries));
    return {
      loadedAssetIds: entries.map(([fileId]) => fileId),
      failedAssetLoads: [],
    };
  } catch (error) {
    if (!isolateFailures || entries.length === 1) {
      return {
        loadedAssetIds: [],
        failedAssetLoads: entries.map(([fileId]) => ({ fileId, error })),
      };
    }

    const settled = await Promise.allSettled(
      entries.map(async ([fileId, asset]) => {
        await graphicsService.loadAssets({ [fileId]: asset });
        return fileId;
      }),
    );

    return settled.reduce(
      (result, entry, index) => {
        const fileId = entries[index]?.[0];
        if (entry.status === "fulfilled") {
          result.loadedAssetIds.push(entry.value);
          return result;
        }

        result.failedAssetLoads.push({
          fileId,
          error: entry.reason,
        });
        return result;
      },
      {
        loadedAssetIds: [],
        failedAssetLoads: [],
      },
    );
  }
};

const loadAssetsWithFailureIsolation = async (
  graphicsService,
  assets,
  expectedFileIds,
) => {
  const loadedAssetIds = [];
  const failedAssetLoads = [];
  const unresolvedAssetIds = expectedFileIds.filter(
    (fileId) => !assets[fileId],
  );

  unresolvedAssetIds.forEach((fileId) => {
    failedAssetLoads.push({
      fileId,
      error: new Error("Scene asset file content was not available"),
    });
  });

  const { primaryEntries, videoEntries } = splitAssetEntriesForLoading(assets);
  const primaryResult = await loadAssetEntriesAsGroup(
    graphicsService,
    primaryEntries,
    {
      isolateFailures: true,
    },
  );
  const videoResult = await loadAssetEntriesAsGroup(
    graphicsService,
    videoEntries,
    {
      isolateFailures: true,
    },
  );

  loadedAssetIds.push(
    ...primaryResult.loadedAssetIds,
    ...videoResult.loadedAssetIds,
  );
  failedAssetLoads.push(
    ...primaryResult.failedAssetLoads,
    ...videoResult.failedAssetLoads,
  );

  markSceneAssetsLoaded(loadedAssetIds);
  markSceneAssetLoadFailures(failedAssetLoads);

  return {
    loadedAssetIds,
    failedAssetLoads,
    primaryAssetCount: primaryEntries.length,
    videoAssetCount: videoEntries.length,
    unresolvedAssetCount: unresolvedAssetIds.length,
  };
};

const loadMissingAssetReferences = async (
  deps,
  missingFileReferences,
  resources,
  context,
) => {
  const { graphicsService, projectService } = deps;
  const startedAt = getDebugNow();
  const expectedFileIds = getUniqueFileIdsFromReferences(missingFileReferences);
  const assets = await createAssetsFromFileIds(
    missingFileReferences,
    projectService,
    resources,
  );
  const result = await loadAssetsWithFailureIsolation(
    graphicsService,
    assets,
    expectedFileIds,
  );

  emitSceneEditorTiming("runtime.assets.load", {
    ...context,
    durationMs: getDebugDurationMs(startedAt),
    requestedAssetCount: expectedFileIds.length,
    loadedAssetCount: result.loadedAssetIds.length,
    failedAssetCount: result.failedAssetLoads.length,
    primaryAssetCount: result.primaryAssetCount,
    videoAssetCount: result.videoAssetCount,
    unresolvedAssetCount: result.unresolvedAssetCount,
    failedAssetIds: result.failedAssetLoads.map(({ fileId }) => fileId),
    failedAssetMessages: result.failedAssetLoads.map(({ error }) =>
      getErrorMessage(error),
    ),
  });

  return result.loadedAssetIds;
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
  const { missingFileReferences, skippedFailedFileIds } =
    selectFileReferencesForAssetLoad(
      deps,
      fileReferences,
      projectData.resources,
    );
  const pendingFileIds = getUniqueFileIdsFromReferences(fileReferences).filter(
    (fileId) => assetLoadCache.pendingFileLoads.has(fileId),
  );
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
  const pendingLoadPromises = pendingFileIds
    .map((fileId) => assetLoadCache.pendingFileLoads.get(fileId))
    .filter(Boolean);
  const newFileIds = getUniqueFileIdsFromReferences(missingFileReferences);

  try {
    uniqueSceneIds.forEach((sceneId) => {
      assetLoadCache.pendingSceneIds.add(sceneId);
    });

    if (shouldShowLoading) {
      setSceneAssetLoading(deps, true);
    }

    if (missingFileReferences.length > 0) {
      const nextLoadPromise = (async () => {
        return await loadMissingAssetReferences(
          deps,
          missingFileReferences,
          projectData.resources,
          {
            source: "scene",
            sceneIds: uniqueSceneIds,
            skippedFailedAssetCount: skippedFailedFileIds.length,
            skippedFailedAssetIds: skippedFailedFileIds,
          },
        );
      })();

      newFileIds.forEach((fileId) => {
        assetLoadCache.pendingFileLoads.set(fileId, nextLoadPromise);
      });

      await nextLoadPromise.finally(() => {
        newFileIds.forEach((fileId) => {
          assetLoadCache.pendingFileLoads.delete(fileId);
        });
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
    const copy = selectSceneEditorCopy(deps.i18n);
    appService?.showAlert({
      message: copy.failedLoadSceneAssets ?? "Failed to load some scene assets",
      title: copy.warningTitle ?? "Warning",
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

  const { appService } = deps;
  const { missingFileReferences, skippedFailedFileIds } =
    selectFileReferencesForAssetLoad(deps, fileReferences, resources);
  const pendingFileIds = getUniqueFileIdsFromReferences(fileReferences).filter(
    (fileId) => assetLoadCache.pendingFileLoads.has(fileId),
  );

  if (missingFileReferences.length === 0 && pendingFileIds.length === 0) {
    return;
  }

  const shouldShowLoading = showLoading && missingFileReferences.length > 0;
  const pendingLoadPromises = pendingFileIds
    .map((fileId) => assetLoadCache.pendingFileLoads.get(fileId))
    .filter(Boolean);
  const newFileIds = getUniqueFileIdsFromReferences(missingFileReferences);

  try {
    if (shouldShowLoading) {
      setSceneAssetLoading(deps, true);
    }

    if (missingFileReferences.length > 0) {
      const nextLoadPromise = (async () => {
        return await loadMissingAssetReferences(
          deps,
          missingFileReferences,
          resources,
          {
            source: "file-references",
            skippedFailedAssetCount: skippedFailedFileIds.length,
            skippedFailedAssetIds: skippedFailedFileIds,
          },
        );
      })();

      newFileIds.forEach((fileId) => {
        assetLoadCache.pendingFileLoads.set(fileId, nextLoadPromise);
      });

      await nextLoadPromise.finally(() => {
        newFileIds.forEach((fileId) => {
          assetLoadCache.pendingFileLoads.delete(fileId);
        });
      });
    }

    if (pendingLoadPromises.length > 0) {
      await Promise.all(pendingLoadPromises);
    }
  } catch (error) {
    const copy = selectSceneEditorCopy(deps.i18n);
    appService?.showAlert({
      message: copy.failedLoadSceneAssets ?? "Failed to load some scene assets",
      title: copy.warningTitle ?? "Warning",
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
  const { missingFileReferences, skippedFailedFileIds } =
    selectFileReferencesForAssetLoad(
      deps,
      fileReferences,
      projectData.resources,
    );
  const pendingFileIds = getUniqueFileIdsFromReferences(fileReferences).filter(
    (fileId) => assetLoadCache.pendingFileLoads.has(fileId),
  );

  if (missingFileReferences.length === 0 && pendingFileIds.length === 0) {
    return;
  }

  const pendingLoadPromises = pendingFileIds
    .map((fileId) => assetLoadCache.pendingFileLoads.get(fileId))
    .filter(Boolean);
  const newFileIds = getUniqueFileIdsFromReferences(missingFileReferences);
  if (missingFileReferences.length > 0) {
    const nextLoadPromise = (async () => {
      return await loadMissingAssetReferences(
        deps,
        missingFileReferences,
        projectData.resources,
        {
          source: "layout",
          layoutIds: uniqueLayoutIds,
          skippedFailedAssetCount: skippedFailedFileIds.length,
          skippedFailedAssetIds: skippedFailedFileIds,
        },
      );
    })();

    newFileIds.forEach((fileId) => {
      assetLoadCache.pendingFileLoads.set(fileId, nextLoadPromise);
    });

    await nextLoadPromise.finally(() => {
      newFileIds.forEach((fileId) => {
        assetLoadCache.pendingFileLoads.delete(fileId);
      });
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
  const {
    preserveAnimationPlayback = false,
    skipAnimations = true,
    skipCanvasPaint = false,
  } = payload;
  const perfEnabled = isDebugEnabled(SCENE_EDITOR_PERF_SCOPE);
  const timingEnabled = shouldMeasureSceneEditorTiming();
  const shouldMeasure = perfEnabled || timingEnabled;
  const renderStartedAt = shouldMeasure ? getDebugNow() : 0;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  const projectDataProjectionStartedAt = shouldMeasure ? getDebugNow() : 0;
  const projectedProjectData = store.selectProjectData();
  const projectDataProjectionDurationMs = shouldMeasure
    ? getDebugDurationMs(projectDataProjectionStartedAt)
    : undefined;
  const projectDataSelectionStartedAt = shouldMeasure ? getDebugNow() : 0;
  const selection = {
    sceneId,
    sectionId,
    lineId,
  };
  const projectData = createProjectDataWithSelectedEntryPoint(
    projectedProjectData,
    selection,
  );
  const projectDataSelectionDurationMs = shouldMeasure
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
  const engineInitStartedAt = shouldMeasure ? getDebugNow() : 0;
  initRouteEngineWithDiagnostics(graphicsService, projectData, {
    enableGlobalKeyboardBindings: false,
    suppressRenderEffects: true,
    onRenderState,
  });
  const engineInitDurationMs = shouldMeasure
    ? getDebugDurationMs(engineInitStartedAt)
    : undefined;
  const presentationStateStartedAt = shouldMeasure ? getDebugNow() : 0;
  const presentationState = graphicsService.engineSelectPresentationState();
  store.setPresentationState({
    presentationState,
  });
  const presentationStateDurationMs = shouldMeasure
    ? getDebugDurationMs(presentationStateStartedAt)
    : undefined;
  const temporaryPresentationState = selectTemporaryPresentationState(store);
  const temporaryPresentationStateStartedAt = shouldMeasure ? getDebugNow() : 0;
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

  if (renderProjectData !== projectData) {
    initRouteEngineWithDiagnostics(graphicsService, renderProjectData, {
      enableGlobalKeyboardBindings: false,
      suppressRenderEffects: true,
      onRenderState,
    });
  }
  const temporaryPresentationStateDurationMs = shouldMeasure
    ? getDebugDurationMs(temporaryPresentationStateStartedAt)
    : undefined;
  const renderStateSelectStartedAt = shouldMeasure ? getDebugNow() : 0;
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
  const renderStateSelectDurationMs = shouldMeasure
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
    if (timingEnabled) {
      emitSceneEditorTiming("runtime.render-state.missing-render-state", {
        durationMs: getDebugDurationMs(renderStartedAt),
        sceneId,
        sectionId,
        lineId,
        projectDataProjectionDurationMs,
        projectDataSelectionDurationMs,
        engineInitDurationMs,
        renderStateSelectDurationMs,
        presentationStateDurationMs,
        temporaryPresentationStateDurationMs,
      });
    }
    return;
  }

  await preloadFileReferences(
    deps,
    extractFileIdsFromRenderState(currentRenderState),
    {
      resources: renderProjectData?.resources,
      showLoading: false,
    },
  );

  const activeAudioFileIds =
    payload?.skipAudio || isMuted
      ? []
      : (graphicsService.collectRenderStateAudioKeys?.(currentRenderState) ??
        []);
  const audioLoadStartedAt = shouldMeasure ? getDebugNow() : 0;
  await graphicsService.ensureAudioAssetsLoaded(activeAudioFileIds);
  const audioLoadDurationMs = shouldMeasure
    ? getDebugDurationMs(audioLoadStartedAt)
    : undefined;

  let canvasPaintDurationMs = 0;
  if (!skipCanvasPaint) {
    await attachGraphicsCanvasToMountedRoot(deps, 2);
    const canvasPaintStartedAt = shouldMeasure ? getDebugNow() : 0;
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
        preserveAnimationPlayback,
        skipAudio: isMuted,
        skipAnimations,
      });
    }
    if (shouldMeasure) {
      canvasPaintDurationMs = getDebugDurationMs(canvasPaintStartedAt);
    }
  }

  const nextLineConfigStartedAt = shouldMeasure ? getDebugNow() : 0;
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
  const nextLineConfigDurationMs = shouldMeasure
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
  if (timingEnabled) {
    emitSceneEditorTiming("runtime.render-state.complete", {
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
  const timingStartedAt = getDebugNow();
  const selectedSectionId = store.selectSelectedSectionId();
  const sectionIds = getSceneSectionIds(store.selectScene?.());
  if (sectionIds.length === 0 && selectedSectionId) {
    sectionIds.push(selectedSectionId);
  }
  if (sectionIds.length === 0) {
    emitSceneEditorTiming("runtime.section-changes", {
      durationMs: getDebugDurationMs(timingStartedAt),
      selectedSectionId,
      sectionCount: 0,
    });
    return;
  }

  const changesBySectionId = {};
  let lineChangeCount = 0;
  for (const sectionId of sectionIds) {
    changesBySectionId[sectionId] =
      graphicsService.engineSelectSectionLineChanges({
        sectionId,
        includePresentationState: true,
      });
    lineChangeCount += Array.isArray(changesBySectionId[sectionId]?.lines)
      ? changesBySectionId[sectionId].lines.length
      : 0;
  }

  if (store.setSectionLineChangesBySectionId) {
    store.setSectionLineChangesBySectionId({ changesBySectionId });
    emitSceneEditorTiming("runtime.section-changes", {
      durationMs: getDebugDurationMs(timingStartedAt),
      selectedSectionId,
      sectionCount: sectionIds.length,
      lineChangeCount,
    });
    return;
  }

  store.setSectionLineChanges({
    changes: selectedSectionId ? changesBySectionId[selectedSectionId] : {},
  });
  emitSceneEditorTiming("runtime.section-changes", {
    durationMs: getDebugDurationMs(timingStartedAt),
    selectedSectionId,
    sectionCount: sectionIds.length,
    lineChangeCount,
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
    store.setSelectedLineId({ selectedLineId: undefined });
    const nextPayload = {
      ...appService.getPayload(),
      s: sceneId,
    };
    delete nextPayload.sceneId;
    if (entrySelection.sectionId) {
      nextPayload.sectionId = entrySelection.sectionId;
    } else {
      delete nextPayload.sectionId;
    }
    delete nextPayload.lineId;
    appService.setPayload?.(nextPayload);
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
  await preloadLayoutAssetsByIds(
    deps,
    projectData,
    Object.keys(projectData?.resources?.layouts || {}),
  );

  const onRenderState = createRuntimeCurrentLineRenderStateHandler(deps);
  initRouteEngineWithDiagnostics(graphicsService, initialProjectData, {
    enableGlobalKeyboardBindings: false,
    onRenderState,
  });

  await renderSceneEditorState(deps);
};

export const renderSceneEditorCanvas = async (deps, payload) => {
  const { store, render } = deps;
  const timingEnabled = shouldMeasureSceneEditorTiming();
  const canvasStartedAt = timingEnabled ? getDebugNow() : 0;
  if (store.selectIsScenePageLoading()) {
    if (timingEnabled) {
      emitSceneEditorTiming("runtime.render-canvas.skipped", {
        durationMs: getDebugDurationMs(canvasStartedAt),
        reason: "scene-page-loading",
        skipRender: payload?.skipRender === true,
      });
    }
    return;
  }

  if (isSceneEditorPreviewVisible(store)) {
    if (timingEnabled) {
      emitSceneEditorTiming("runtime.render-canvas.skipped", {
        durationMs: getDebugDurationMs(canvasStartedAt),
        reason: "preview-visible",
        skipRender: payload?.skipRender === true,
      });
    }
    return;
  }

  const backgroundTransformEditorOpen =
    store.selectIsBackgroundTransformEditorOpen?.() === true;
  const mountedCanvasRoot = getCurrentCanvasRoot(deps.refs, {
    preferTransformEditorCanvas: backgroundTransformEditorOpen,
  });
  if (!mountedCanvasRoot?.isConnected) {
    if (timingEnabled) {
      emitSceneEditorTiming("runtime.render-canvas.skipped", {
        durationMs: getDebugDurationMs(canvasStartedAt),
        reason: "missing-canvas-root",
        skipRender: payload?.skipRender === true,
      });
    }
    return;
  }

  const perfEnabled = isDebugEnabled(SCENE_EDITOR_PERF_SCOPE);
  const shouldMeasure = perfEnabled || timingEnabled;
  const renderStartedAt = shouldMeasure ? getDebugNow() : 0;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  const projectDataStartedAt = shouldMeasure ? getDebugNow() : 0;
  const projectData = createProjectDataWithSelectedEntryPoint(
    store.selectProjectData(),
    {
      sceneId,
      sectionId,
      lineId,
    },
  );
  const projectDataDurationMs = shouldMeasure
    ? getDebugDurationMs(projectDataStartedAt)
    : undefined;
  const sceneIdsToLoad = extractInitialHybridSceneIds(projectData, sceneId);
  const shouldSyncPresentationState =
    payload?.skipRender === true && payload?.syncPresentationState === true;
  const previousPresentationStateSnapshot = shouldSyncPresentationState
    ? getPresentationStateSnapshot(store)
    : undefined;

  const sceneAssetLoadStartedAt = shouldMeasure ? getDebugNow() : 0;
  await loadAssetsForSceneIds(deps, projectData, sceneIdsToLoad, {
    showLoading: false,
  });
  const sceneAssetLoadDurationMs = shouldMeasure
    ? getDebugDurationMs(sceneAssetLoadStartedAt)
    : undefined;
  void preloadDirectTransitionScenes(deps, projectData, sceneIdsToLoad);

  const renderSceneStateStartedAt = shouldMeasure ? getDebugNow() : 0;
  await renderSceneEditorState(deps, payload);
  const renderSceneStateDurationMs = shouldMeasure
    ? getDebugDurationMs(renderSceneStateStartedAt)
    : undefined;
  const sectionChangesStartedAt = shouldMeasure ? getDebugNow() : 0;
  await updateSceneEditorSectionChanges(deps);
  const sectionChangesDurationMs = shouldMeasure
    ? getDebugDurationMs(sectionChangesStartedAt)
    : undefined;

  let uiRenderDurationMs = 0;
  const shouldRenderUi =
    !payload?.skipRender ||
    (shouldSyncPresentationState &&
      previousPresentationStateSnapshot !==
        getPresentationStateSnapshot(store));
  if (shouldRenderUi) {
    const uiRenderStartedAt = shouldMeasure ? getDebugNow() : 0;
    render();
    if (shouldMeasure) {
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
      projectDataDurationMs,
      sceneAssetLoadDurationMs,
      renderSceneStateDurationMs,
      sectionChangesDurationMs,
      uiRenderDurationMs,
      sceneIdsToLoad,
    });
  }
  if (timingEnabled) {
    emitSceneEditorTiming("runtime.render-canvas.complete", {
      durationMs: getDebugDurationMs(renderStartedAt),
      sceneId,
      sectionId,
      lineId,
      skipRender: payload?.skipRender === true,
      skipAnimations: payload?.skipAnimations ?? true,
      skipCanvasPaint: payload?.skipCanvasPaint === true,
      syncPresentationState: payload?.syncPresentationState === true,
      shouldRenderUi,
      projectDataDurationMs,
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
      tap(({ payload }) => {
        emitSceneEditorTiming("runtime.render-canvas.event", {
          phase: "received",
          skipRender: payload?.skipRender === true,
          skipAnimations: payload?.skipAnimations ?? true,
          skipCanvasPaint: payload?.skipCanvasPaint === true,
          syncPresentationState: payload?.syncPresentationState === true,
        });
      }),
      debounceTime(50),
      tap(async ({ payload }) => {
        const queueStartedAt = getDebugNow();
        await queueRenderCanvas(payload);
        emitSceneEditorTiming("runtime.render-canvas.event", {
          phase: "queued-complete",
          durationMs: getDebugDurationMs(queueStartedAt),
          skipRender: payload?.skipRender === true,
          skipAnimations: payload?.skipAnimations ?? true,
          skipCanvasPaint: payload?.skipCanvasPaint === true,
          syncPresentationState: payload?.syncPresentationState === true,
        });
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
