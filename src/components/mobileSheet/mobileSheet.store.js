export const createInitialState = () => ({});

export const selectViewData = ({ props }) => {
  return {
    open: Boolean(props.open),
    height: props.height ?? "50vh",
    overlayZ: props.overlayZ ?? "1600",
    sheetZ: props.sheetZ ?? "1601",
  };
};
