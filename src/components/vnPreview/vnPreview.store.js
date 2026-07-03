import {
  DEFAULT_PROJECT_RESOLUTION,
  formatProjectResolutionAspectRatio,
  requireProjectResolution,
} from "../../internal/projectResolution.js";

const createEmptyAssetLoadCache = () => ({
  sceneIds: [],
  fileIds: [],
});

const toPositiveDimension = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : undefined;
};

const createViewportSize = () => ({
  width:
    toPositiveDimension(globalThis.window?.innerWidth) ??
    DEFAULT_PROJECT_RESOLUTION.width,
  height:
    toPositiveDimension(globalThis.window?.innerHeight) ??
    DEFAULT_PROJECT_RESOLUTION.height,
});

const formatCssPixels = (value) => `${Math.round(value * 100) / 100}px`;

const createPreviewFrameStyle = ({ projectResolution, viewportSize }) => {
  const projectWidth =
    toPositiveDimension(projectResolution?.width) ??
    DEFAULT_PROJECT_RESOLUTION.width;
  const projectHeight =
    toPositiveDimension(projectResolution?.height) ??
    DEFAULT_PROJECT_RESOLUTION.height;
  const viewportWidth =
    toPositiveDimension(viewportSize?.width) ??
    DEFAULT_PROJECT_RESOLUTION.width;
  const viewportHeight =
    toPositiveDimension(viewportSize?.height) ??
    DEFAULT_PROJECT_RESOLUTION.height;
  const scale = Math.min(
    viewportWidth / projectWidth,
    viewportHeight / projectHeight,
  );
  const width = projectWidth * scale;
  const height = projectHeight * scale;

  return [
    "flex: 0 0 auto",
    "position: relative",
    `aspect-ratio: ${projectWidth} / ${projectHeight}`,
    `width: ${formatCssPixels(width)}`,
    `height: ${formatCssPixels(height)}`,
    "max-width: 100vw",
    "max-height: 100vh",
    "overflow: hidden",
    "background: #000",
  ].join("; ");
};

const readAssetLoadCache = (state) => {
  if (!state || typeof state !== "object") {
    return createEmptyAssetLoadCache();
  }

  if (
    !state.assetLoadCache ||
    !Array.isArray(state.assetLoadCache.sceneIds) ||
    !Array.isArray(state.assetLoadCache.fileIds)
  ) {
    return createEmptyAssetLoadCache();
  }

  return state.assetLoadCache;
};

const ensureAssetLoadCache = (state) => {
  if (!state || typeof state !== "object") {
    return createEmptyAssetLoadCache();
  }

  if (
    !state.assetLoadCache ||
    !Array.isArray(state.assetLoadCache.sceneIds) ||
    !Array.isArray(state.assetLoadCache.fileIds)
  ) {
    state.assetLoadCache = createEmptyAssetLoadCache();
  }

  return state.assetLoadCache;
};

export const createInitialState = () => ({
  isAssetLoading: false,
  isPreviewReady: false,
  assetLoadCache: createEmptyAssetLoadCache(),
  projectResolution: DEFAULT_PROJECT_RESOLUTION,
  viewportSize: createViewportSize(),
});

export const setAssetLoading = ({ state }, { isLoading } = {}) => {
  state.isAssetLoading = isLoading;
};

export const setPreviewReady = ({ state }, { isPreviewReady } = {}) => {
  state.isPreviewReady = isPreviewReady === true;
};

export const resetAssetLoadCache = ({ state }, _payload = {}) => {
  state.assetLoadCache = createEmptyAssetLoadCache();
};

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );
};

export const setViewportSize = ({ state }, { width, height } = {}) => {
  const currentViewportSize = state.viewportSize ?? createViewportSize();
  state.viewportSize = {
    width: toPositiveDimension(width) ?? currentViewportSize.width,
    height: toPositiveDimension(height) ?? currentViewportSize.height,
  };
};

export const selectAssetLoadCache = ({ state }) => readAssetLoadCache(state);

export const selectHasLoadedAssetFileId = ({ state }, { fileId } = {}) => {
  return !!fileId && readAssetLoadCache(state).fileIds.includes(fileId);
};

export const selectHasLoadedAssetSceneId = ({ state }, { sceneId } = {}) => {
  return !!sceneId && readAssetLoadCache(state).sceneIds.includes(sceneId);
};

export const markAssetFileIdsLoaded = ({ state }, { fileIds } = {}) => {
  const assetLoadCache = ensureAssetLoadCache(state);

  for (const fileId of fileIds ?? []) {
    if (!fileId || assetLoadCache.fileIds.includes(fileId)) {
      continue;
    }
    assetLoadCache.fileIds.push(fileId);
  }
};

export const markAssetSceneIdsLoaded = ({ state }, { sceneIds } = {}) => {
  const assetLoadCache = ensureAssetLoadCache(state);

  for (const sceneId of sceneIds ?? []) {
    if (!sceneId || assetLoadCache.sceneIds.includes(sceneId)) {
      continue;
    }
    assetLoadCache.sceneIds.push(sceneId);
  }
};

export const selectViewData = ({ props: attrs, state }) => {
  return {
    sceneId: attrs.sceneId,
    sectionId: attrs.sectionId,
    lineId: attrs.lineId,
    isAssetLoading: state.isAssetLoading,
    isPreviewReady: state.isPreviewReady,
    canvasAspectRatio: formatProjectResolutionAspectRatio(
      state.projectResolution,
    ),
    previewFrameStyle: createPreviewFrameStyle({
      projectResolution: state.projectResolution,
      viewportSize: state.viewportSize,
    }),
  };
};
