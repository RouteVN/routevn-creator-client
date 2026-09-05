export const createInitialState = () => ({});

export const selectViewData = ({ props, i18n }) => {
  const copy = i18n.animationCameraEditor;
  return {
    ...props,
    title: props.initial ? copy.initialTitle : copy.title,
    doneButton: copy.doneButton,
    resetButton: copy.resetButton,
    zoomInLabel: copy.zoomInLabel,
    zoomOutLabel: copy.zoomOutLabel,
    viewportLabel: copy.viewportLabel,
    zoomLabel: `${Math.round(props.pose.scaleX * 100)}%`,
  };
};
