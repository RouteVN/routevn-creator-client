export const createInitialState = () => ({});

export const selectViewData = ({ props }) => {
  return {
    canvasAspectRatio: props.canvasAspectRatio || "16 / 9",
  };
};
