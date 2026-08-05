import {
  DEFAULT_PROJECT_RESOLUTION,
  formatHalfViewportCanvasMaxWidth,
} from "../../internal/projectResolution.js";
import { normalizeBackgroundTransformEditorTransform } from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";

const TARGET_TYPE_COPY = Object.freeze({
  background: {
    key: "backgroundTarget",
    fallback: "Background",
  },
  visual: {
    key: "visualTarget",
    fallback: "Visual",
  },
  character: {
    key: "characterTarget",
    fallback: "Character",
  },
});

const selectCopy = (i18n = {}) => i18n.actionTransformEditor ?? {};

const toInspectorValues = (transform = {}) => ({
  ...transform,
  anchor: {
    x: transform.anchorX,
    y: transform.anchorY,
  },
});

export const createInitialState = () => ({
  isTouchMode: false,
  backgroundDrag: undefined,
});

export const selectIsTouchMode = ({ state }) => state.isTouchMode === true;

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectCopy(i18n);
  const transform = normalizeBackgroundTransformEditorTransform(
    state.backgroundDrag?.currentTransform ?? props.transform,
  );
  const targetType = TARGET_TYPE_COPY[props.targetType]
    ? props.targetType
    : "background";
  const targetTypeCopy = TARGET_TYPE_COPY[targetType];
  const projectResolution =
    props.projectResolution ?? DEFAULT_PROJECT_RESOLUTION;

  return {
    isTouchMode: state.isTouchMode === true,
    title: copy.title ?? "Transform",
    doneButton: copy.doneButton ?? "Done",
    targetTitle: copy.targetTitle ?? "Target",
    targetTypeLabel: copy[targetTypeCopy.key] ?? targetTypeCopy.fallback,
    targetName: props.targetName ?? copy.unnamedTarget ?? "Current item",
    canvasAspectRatio: props.canvasAspectRatio ?? "16 / 9",
    canvasMaxWidth: formatHalfViewportCanvasMaxWidth(projectResolution),
    projectResolution,
    selectedElementMetrics: props.selectedElementMetrics,
    inspectorValues: toInspectorValues(transform),
    isBackgroundTarget: targetType === "background",
    backgroundDragCursor: state.backgroundDrag ? "grabbing" : "move",
  };
};

export const startBackgroundDrag = (
  { state },
  {
    pointerId,
    startClientX,
    startClientY,
    canvasWidth,
    canvasHeight,
    projectResolution,
    transform,
  } = {},
) => {
  state.backgroundDrag = {
    pointerId,
    startClientX,
    startClientY,
    canvasWidth,
    canvasHeight,
    projectResolution,
    transform,
    currentTransform: transform,
  };
};

export const setBackgroundDragTransform = ({ state }, { transform } = {}) => {
  if (!state.backgroundDrag) {
    return;
  }

  state.backgroundDrag.currentTransform = transform;
};

export const setBackgroundDragPreviewFrameId = (
  { state },
  { frameId } = {},
) => {
  if (!state.backgroundDrag) {
    return;
  }

  state.backgroundDrag.previewFrameId = frameId;
};

export const stopBackgroundDrag = ({ state }) => {
  state.backgroundDrag = undefined;
};

export const selectBackgroundDrag = ({ state }) => state.backgroundDrag;

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};
