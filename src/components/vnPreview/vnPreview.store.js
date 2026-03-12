const createEmptyAssetLoadCache = () => ({
  sceneIds: [],
  fileIds: [],
});

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
  assetLoadCache: createEmptyAssetLoadCache(),
});

export const setAssetLoading = ({ state }, { isLoading } = {}) => {
  state.isAssetLoading = isLoading;
};

export const resetAssetLoadCache = ({ state }, _payload = {}) => {
  state.assetLoadCache = createEmptyAssetLoadCache();
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
  };
};
