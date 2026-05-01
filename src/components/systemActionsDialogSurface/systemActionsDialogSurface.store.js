export const createInitialState = () => ({});

const normalizeVariant = (variant) =>
  variant === "scene-editor-left" ? "scene-editor-left" : "default";

export const selectViewData = ({ props }) => {
  const variant = normalizeVariant(props.variant);

  return {
    open: props.open === true,
    variant,
    isSceneEditorLeft: variant === "scene-editor-left",
    dialogWidth: props.dialogWidth ?? "800",
    dialogHeight: props.dialogHeight ?? "80vh",
    panelWidth: props.panelWidth ?? "50vw",
    overlayHorizontalInset: "64px",
    overlayBackground: "rgba(0, 0, 0, 0.42)",
    panelHorizontalInset: "96px",
    panelWidthReduction: "64px",
    panelVerticalInset: "32px",
  };
};
