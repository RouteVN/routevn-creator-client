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
