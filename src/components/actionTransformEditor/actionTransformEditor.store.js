import { DEFAULT_PROJECT_RESOLUTION } from "../../internal/projectResolution.js";
import {
  buildEditorCanvasLayoutForPanel,
  buildEditorCanvasZoomViewData,
  resetEditorCanvasZoomState,
  setEditorCanvasZoomState,
  zoomEditorCanvasInState,
  zoomEditorCanvasOutState,
} from "../../internal/ui/editorCanvasWorkspace.js";
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
  isTouchLandscape: false,
  canvasZoom: 1,
});

export const selectIsTouchMode = ({ state }) => state.isTouchMode === true;

// Desktop and tablet landscape keep the inspector in a panel to the right of
// the canvas, as the layout editor does, and give the canvas the rest of the
// workspace, where it zooms and pans. Other touch layouts stack the inspector
// under the canvas, which is shown fitted.
const selectShowRightPanel = (state) =>
  !state.isTouchMode || state.isTouchLandscape;

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectCopy(i18n);
  const transform = normalizeBackgroundTransformEditorTransform(
    props.transform,
  );
  const targetType = TARGET_TYPE_COPY[props.targetType]
    ? props.targetType
    : "background";
  const targetTypeCopy = TARGET_TYPE_COPY[targetType];
  const projectResolution =
    props.projectResolution ?? DEFAULT_PROJECT_RESOLUTION;
  const showRightPanel = selectShowRightPanel(state);
  const { canvasBackgroundStyle, canvasWrapperStyle } =
    buildEditorCanvasLayoutForPanel({
      showRightPanel,
      resolution: projectResolution,
    });

  return {
    showTargetPanel: !state.isTouchMode,
    showRightPanel,
    showCanvasZoomControls: showRightPanel,
    ...buildEditorCanvasZoomViewData(showRightPanel ? state.canvasZoom : 1),
    canvasZoomInLabel: copy.canvasZoomInLabel ?? "Zoom in",
    canvasZoomOutLabel: copy.canvasZoomOutLabel ?? "Zoom out",
    canvasZoomFitLabel: copy.canvasZoomFitLabel ?? "Fit to view",
    canvasBackgroundStyle,
    canvasWrapperStyle,
    title: copy.title ?? "Transform",
    cancelButton: copy.cancelButton ?? "Cancel",
    doneButton: copy.doneButton ?? "Done",
    targetTitle: copy.targetTitle ?? "Target",
    targetTypeLabel: copy[targetTypeCopy.key] ?? targetTypeCopy.fallback,
    targetName: props.targetName ?? copy.unnamedTarget ?? "Current item",
    canvasAspectRatio: props.canvasAspectRatio ?? "16 / 9",
    projectResolution,
    selectedElementMetrics: props.selectedElementMetrics,
    inspectorValues: toInspectorValues(transform),
  };
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setTouchLandscape = ({ state }, { isTouchLandscape } = {}) => {
  state.isTouchLandscape = isTouchLandscape;
};

export const selectIsTouchLandscape = ({ state }) => state.isTouchLandscape;

// Canvas zoom is relative to the canvas fitted to the workspace (1 = fit), as
// in the layout editor.
export const zoomCanvasIn = ({ state }) => {
  zoomEditorCanvasInState(state);
};

export const zoomCanvasOut = ({ state }) => {
  zoomEditorCanvasOutState(state);
};

export const setCanvasZoom = ({ state }, { zoom } = {}) => {
  setEditorCanvasZoomState(state, { zoom });
};

export const resetCanvasZoom = ({ state }) => {
  resetEditorCanvasZoomState(state);
};
