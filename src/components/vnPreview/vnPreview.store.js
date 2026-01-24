export const createInitialState = () => ({});

export const selectViewData = ({ attrs }) => {
  return {
    sceneId: attrs.sceneId,
    sectionId: attrs.sectionId,
    lineId: attrs.lineId,
  };
};
