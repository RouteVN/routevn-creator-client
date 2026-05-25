export const createInitialState = () => ({
  suppressClose: false,
});

const normalizeVariant = (variant) =>
  variant === "scene-editor-left" ? "scene-editor-left" : "default";

const isBooleanPropEnabled = (value) => value === true || value === "true";

export const setSuppressClose = ({ state }, { suppressClose } = {}) => {
  state.suppressClose = suppressClose === true;
};

export const selectSuppressClose = ({ state }) => {
  return state.suppressClose === true;
};

export const selectViewData = ({ state, props }) => {
  const variant = normalizeVariant(props.variant);

  return {
    open: props.open === true,
    variant,
    isSceneEditorLeft: variant === "scene-editor-left",
    dialogWidth: props.dialogWidth ?? "800",
    dialogHeight: props.dialogHeight ?? "80vh",
    panelWidth: props.panelWidth ?? "50vw",
    suppressClose:
      state.suppressClose === true || isBooleanPropEnabled(props.suppressClose),
    overlayHorizontalInset: "64px",
    overlayBackground: "rgba(0, 0, 0, 0.42)",
    panelHorizontalInset: "96px",
    panelWidthReduction: "64px",
    panelVerticalInset: "32px",
  };
};
