export const createInitialState = () => ({
  isAssetLoading: false,
});

export const setAssetLoading = (state, isLoading) => {
  state.isAssetLoading = isLoading;
};

export const selectViewData = ({ attrs, state }) => {
  return {
    sceneId: attrs.sceneId,
    sectionId: attrs.sectionId,
    lineId: attrs.lineId,
    isAssetLoading: state.isAssetLoading,
  };
};
