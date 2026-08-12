export const createInitialState = () => ({
  suppressClose: false,
});

const normalizeVariant = (variant) => {
  if (variant === "scene-editor-left" || variant === "scene-editor-mobile") {
    return variant;
  }

  return "default";
};

const isBooleanPropEnabled = (value) => value === true || value === "true";

const selectDialogSize = (dialogWidth) => {
  return dialogWidth === "100%" ? "md" : undefined;
};

export const setSuppressClose = ({ state }, { suppressClose } = {}) => {
  state.suppressClose = suppressClose === true;
};

export const selectSuppressClose = ({ state }) => {
  return state.suppressClose === true;
};

export const selectViewData = ({ state, props }) => {
  const variant = normalizeVariant(props.variant);
  const dialogWidth = props.dialogWidth ?? "800";
  const fullscreen = isBooleanPropEnabled(props.fullscreen);

  return {
    open: props.open === true,
    variant,
    isSceneEditorLeft: variant === "scene-editor-left",
    isSceneEditorMobile: variant === "scene-editor-mobile",
    fullscreen,
    fullscreenHorizontalInset: props.fullscreenHorizontalInset ?? "0px",
    dialogWidth,
    dialogSize: selectDialogSize(dialogWidth),
    dialogHeight: props.dialogHeight ?? "80vh",
    dialogPadding: props.dialogPadding === "none" ? "none" : "lg",
    panelWidth: props.panelWidth ?? "50vw",
    panelTop: props.panelTop ?? "0px",
    panelBottom: props.panelBottom ?? "0px",
    suppressClose:
      state.suppressClose === true || isBooleanPropEnabled(props.suppressClose),
    overlayHorizontalInset: "64px",
    overlayBackground: "rgba(0, 0, 0, 0.42)",
    panelHorizontalInset: "96px",
    panelWidthReduction: "64px",
    panelVerticalInset: "32px",
    panelMaxHeight: "800px",
  };
};
