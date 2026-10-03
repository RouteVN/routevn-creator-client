export const createInitialState = () => ({});

export const selectViewData = ({ props }) => {
  return {
    open: Boolean(props.open),
    height: props.height ?? "50vh",
    maxWidth: props.maxWidth ?? "640px",
    overlayZ: props.overlayZ ?? "1600",
    sheetZ: props.sheetZ ?? "1601",
  };
};
