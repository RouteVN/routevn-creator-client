export const createInitialState = () => ({
  isAssetLoading: false,
  assetLoadCache: {
    sceneIds: [],
    fileIds: [],
  },
});

export const setAssetLoading = ({ state }, { isLoading } = {}) => {
  state.isAssetLoading = isLoading;
};

export const resetAssetLoadCache = ({ state }, _payload = {}) => {
  state.assetLoadCache = {
    sceneIds: [],
    fileIds: [],
  };
};

export const selectAssetLoadCache = ({ state }) => state.assetLoadCache;

export const hasLoadedAssetFileId = ({ state }, { fileId } = {}) => {
  return !!fileId && state.assetLoadCache.fileIds.includes(fileId);
};

export const hasLoadedAssetSceneId = ({ state }, { sceneId } = {}) => {
  return !!sceneId && state.assetLoadCache.sceneIds.includes(sceneId);
};

export const markAssetFileIdsLoaded = ({ state }, { fileIds } = {}) => {
  for (const fileId of fileIds ?? []) {
    if (!fileId || state.assetLoadCache.fileIds.includes(fileId)) {
      continue;
    }
    state.assetLoadCache.fileIds.push(fileId);
  }
};

export const markAssetSceneIdsLoaded = ({ state }, { sceneIds } = {}) => {
  for (const sceneId of sceneIds ?? []) {
    if (!sceneId || state.assetLoadCache.sceneIds.includes(sceneId)) {
      continue;
    }
    state.assetLoadCache.sceneIds.push(sceneId);
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
