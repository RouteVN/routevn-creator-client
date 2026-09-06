export const createInitialState = () => ({ valueEditor: undefined });

export const selectValueEditor = ({ state }) => state.valueEditor;

export const selectEditedValue = ({ state }) => {
  const editor = state.valueEditor;
  if (!editor || editor.value.trim() === "") return undefined;
  const value = Number(editor.value);
  if (!Number.isFinite(value) || (editor.field === "zoom" && value <= 0))
    return undefined;
  return value;
};

const formatValue = (value) => Number(value.toFixed(2));

export const selectViewData = ({ state, props, i18n }) => {
  const copy = i18n.animationCameraEditor;
  const valueLabels = {
    x: i18n.animationEditorPage.positionXPropertyLabel,
    y: i18n.animationEditorPage.positionYPropertyLabel,
    zoom: copy.zoomValueLabel,
  };
  const valueEditor = state.valueEditor;
  const invalidValue = selectEditedValue({ state }) === undefined;
  return {
    ...props,
    title: props.initial ? copy.initialTitle : copy.title,
    doneButton: copy.doneButton,
    resetButton: copy.resetButton,
    zoomInLabel: copy.zoomInLabel,
    zoomOutLabel: copy.zoomOutLabel,
    viewportLabel: copy.viewportLabel,
    xLabel: `X ${formatValue(props.pose.x)}`,
    yLabel: `Y ${formatValue(props.pose.y)}`,
    zoomLabel: `${formatValue(props.pose.scaleX * 100)}%`,
    valueLabels,
    valueEditor,
    valueEditorLabel: valueLabels[valueEditor?.field],
    invalidValue,
    valueError:
      valueEditor?.field === "zoom"
        ? copy.invalidZoomMessage
        : copy.invalidNumberMessage,
  };
};

export const openValueEditor = ({ state, props }, { field, x, y }) => {
  const value = String(
    formatValue(field === "zoom" ? props.pose.scaleX * 100 : props.pose[field]),
  );
  state.valueEditor = {
    field,
    x,
    y,
    value,
    originalValue: value,
  };
};

export const setEditorValue = ({ state }, { value }) => {
  state.valueEditor.value = value;
};

export const closeValueEditor = ({ state }) => {
  state.valueEditor = undefined;
};
