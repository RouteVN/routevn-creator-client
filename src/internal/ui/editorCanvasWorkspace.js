import {
  formatCanvasMaxWidth,
  formatHalfViewportCanvasMaxWidth,
} from "../projectResolution.js";
import { isTouchPhone } from "../touchLayout.js";
import { selectIsTabletLandscapeState } from "./resourcePages/mobileResourcePage.js";

// The canvas workspace of the editor pages built like the layout editor
// (the transform and particle editors): zoom, the right panel and its tabs,
// and the canvas layout. Their stores keep `canvasZoom`, `isTouchMode` and
// `appWindowMetrics`.

// Canvas zoom is relative to the canvas fitted to the workspace (1 = fit),
// as in the layout editor: the buttons step through these levels, and
// gestures set any zoom in their range, which matches rvn-zoom-viewport.
const CANVAS_ZOOM_LEVELS = Object.freeze([
  0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10,
]);

export const zoomEditorCanvasInState = (state) => {
  state.canvasZoom =
    CANVAS_ZOOM_LEVELS.find((level) => level > state.canvasZoom) ??
    state.canvasZoom;
};

export const zoomEditorCanvasOutState = (state) => {
  state.canvasZoom =
    CANVAS_ZOOM_LEVELS.findLast((level) => level < state.canvasZoom) ??
    state.canvasZoom;
};

export const setEditorCanvasZoomState = (state, { zoom } = {}) => {
  state.canvasZoom = Math.min(
    CANVAS_ZOOM_LEVELS.at(-1),
    Math.max(CANVAS_ZOOM_LEVELS[0], zoom),
  );
};

export const resetEditorCanvasZoomState = (state) => {
  state.canvasZoom = 1;
};

// Desktop and tablet landscape keep the Edit and Preview panel on the
// right, as in the layout editor, and give the canvas the rest of the
// workspace, where it zooms and pans. Other touch layouts show the canvas
// fitted to half the workspace height with the panel under it. The text
// style editor, whose live preview is not a canvas, places its panel by the
// same rule.
export const selectShowEditorRightPanelState = ({ state }) =>
  !state.isTouchMode || selectIsTabletLandscapeState({ state });

// Where the Edit and Preview tabs and undo and redo go. Phones put the tabs
// in the navbar after the name, and undo and redo in the header under the
// canvas, in Edit only, as the layout editor does; that header is hidden in
// Preview, where it would be empty. It stays in the page, so the panels after
// it keep their place and are not rebuilt on a switch. Tablets and desktop
// keep the tabs over the panel and undo and redo in the navbar. The stores
// keep `rightPanelMode`.
export const buildEditorPanelPlacementViewData = ({ state }) => {
  const showRightPanel = selectShowEditorRightPanelState({ state });
  const showMobilePanels = !showRightPanel;
  const showPhonePanels =
    showMobilePanels &&
    isTouchPhone({
      isTouchMode: state.isTouchMode,
      width: state.appWindowMetrics.width,
      height: state.appWindowMetrics.height,
    });
  const showPanelEditHistory =
    showPhonePanels && state.rightPanelMode === "edit";

  return {
    showRightPanel,
    showMobilePanels,
    showNavbarEditHistory: !showPhonePanels,
    showNavbarPanelModeTabs: showPhonePanels,
    mobilePanelHeaderStyle:
      !showPhonePanels || showPanelEditHistory ? "" : "display: none;",
    showPanelModeTabs: !showPhonePanels,
    showPanelEditHistory,
  };
};

// The styles of the workspace and of the canvas wrapper for a canvas of
// `resolution`.
export const buildEditorCanvasLayout = ({ state, resolution }) => {
  if (selectShowEditorRightPanelState({ state })) {
    const canvasFitWidth = formatCanvasMaxWidth(resolution, {
      heightUnit: "cqh",
      heightPercent: 92,
    });
    return {
      canvasBackgroundStyle:
        "flex: 1 1 auto; min-height: 0; position: relative; overflow: hidden; background-position: var(--canvas-x, 0px) var(--canvas-y, 0px);",
      canvasWrapperStyle: `position: absolute; left: 0; top: 0; width: calc(${canvasFitWidth} * var(--canvas-zoom, 1)); transform: translate(var(--canvas-x, 0px), var(--canvas-y, 0px));`,
    };
  }

  return {
    canvasBackgroundStyle: "",
    canvasWrapperStyle: `position: relative; width: ${formatHalfViewportCanvasMaxWidth(resolution, { heightUnit: "cqh" })}; margin-left: auto; margin-right: auto;`,
  };
};

// The header's zoom controls.
export const buildEditorCanvasZoomViewData = (canvasZoom) => ({
  canvasZoom,
  canvasZoomLabel: `${Math.round(canvasZoom * 100)}%`,
  canvasZoomInDisabled: canvasZoom >= CANVAS_ZOOM_LEVELS.at(-1),
  canvasZoomOutDisabled: canvasZoom <= CANVAS_ZOOM_LEVELS[0],
});
