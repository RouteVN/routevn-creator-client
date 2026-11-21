import { createAssetLoadSessionGuard } from "../../../internal/ui/assetLoadSessionGuard.js";
import { showAssetLoadFailures } from "../../../internal/ui/assetLoadFeedback.js";
import { loadLayoutEditorAssets } from "./layoutEditorCanvasRender.js";

export const loadAvailableLayoutEditorAssets = async (
  deps,
  fileReferences,
  repositoryState,
) => {
  const { store, projectService, graphicsService } = deps;
  const isCurrent = createAssetLoadSessionGuard({
    projectService,
    canvas: deps.refs?.canvas,
  });
  const { assets, failures } = await loadLayoutEditorAssets({
    projectService,
    selectCachedFileContent: store.selectCachedFileContent,
    clearCachedFileContent: store.clearCachedFileContent,
    cacheFileContent: (payload) => {
      if (isCurrent()) store.cacheFileContent(payload);
    },
    hasLoadedAsset: graphicsService.hasLoadedAsset,
    fileReferences,
    fontsItems: repositoryState.fonts?.items ?? {},
  });
  if (!isCurrent()) return [];
  const entries = Object.entries(assets);
  try {
    await graphicsService.loadAssets(assets);
  } catch (error) {
    if (!isCurrent()) return [];
    if (entries.length === 0) throw error;
    if (entries.length === 1) {
      failures.push({ fileId: entries[0][0], error });
    } else {
      for (const [fileId, asset] of entries) {
        if (!isCurrent()) return [];
        try {
          await graphicsService.loadAssets({ [fileId]: asset });
        } catch (error) {
          failures.push({ fileId, error });
        }
      }
    }
  }
  if (!isCurrent() || failures.length === 0) return [];
  const warned = new Set(store.selectWarnedAssetFileIds());
  const newFailures = failures.filter(({ fileId }) => !warned.has(fileId));
  if (newFailures.length > 0) {
    store.markAssetWarningsShown({
      fileIds: newFailures.map(({ fileId }) => fileId),
    });
    showAssetLoadFailures(deps, newFailures);
    console.warn(
      "[layoutEditorCanvas] Some assets are unavailable",
      newFailures,
    );
  }
  for (const { fileId } of failures) store.clearCachedFileContent({ fileId });
  return failures.map(({ fileId }) => fileId);
};

export const LAYOUT_EDITOR_VIDEO_READY_TIMEOUT_MS = 30_000;

const selectVideoFileIds = (fileReferences, failedFileIds = []) => {
  const failed = new Set(failedFileIds);
  return [
    ...new Set(
      fileReferences
        .filter(
          ({ url, type }) => type?.startsWith("video/") && !failed.has(url),
        )
        .map(({ url }) => url),
    ),
  ];
};

// True when drawing these references means waiting for a video that has no
// frame ready yet, so the canvas can show its loading state before it waits.
export const hasPendingLayoutEditorVideos = (
  { store, graphicsService },
  fileReferences,
) => {
  const remembered = new Set(store.selectTimedOutVideoFileIds());
  return selectVideoFileIds(fileReferences).some(
    (fileId) =>
      !remembered.has(fileId) && !graphicsService.isVideoReady(fileId),
  );
};

export const waitForLayoutEditorVideos = async (
  deps,
  { fileReferences, failedFileIds, onWaitStart, isRenderCurrent = () => true },
) => {
  const { store, projectService, graphicsService } = deps;
  const isCurrent = createAssetLoadSessionGuard({
    projectService,
    canvas: deps.refs?.canvas,
    isCacheCurrent: isRenderCurrent,
  });
  const remembered = new Set(store.selectTimedOutVideoFileIds());
  const videos = selectVideoFileIds(fileReferences, failedFileIds);
  const pending = [];
  const omitted = [];
  for (const fileId of videos) {
    if (graphicsService.isVideoReady(fileId)) continue;
    if (remembered.has(fileId)) omitted.push(fileId);
    else pending.push(fileId);
  }
  if (pending.length === 0 || !isCurrent()) return omitted;
  onWaitStart();
  const { failures } = await graphicsService.waitForVideosReady(pending, {
    timeoutMs: LAYOUT_EDITOR_VIDEO_READY_TIMEOUT_MS,
  });
  if (!isCurrent()) return [];
  const timedOut = failures.filter(
    ({ error }) => error.code === "video_ready_timeout",
  );
  if (timedOut.length) {
    store.rememberTimedOutVideoFileIds({
      fileIds: timedOut.map(({ fileId }) => fileId),
    });
  }
  const warned = new Set(store.selectWarnedAssetFileIds());
  const newFailures = failures.filter(({ fileId }) => !warned.has(fileId));
  if (newFailures.length) {
    store.markAssetWarningsShown({
      fileIds: newFailures.map(({ fileId }) => fileId),
    });
    showAssetLoadFailures(deps, newFailures);
    console.warn(
      "[layoutEditorCanvas] Some assets are unavailable",
      newFailures,
    );
  }
  return [...omitted, ...failures.map(({ fileId }) => fileId)];
};
