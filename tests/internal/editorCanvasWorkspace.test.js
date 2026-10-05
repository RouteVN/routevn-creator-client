import { describe, expect, it } from "vitest";
import {
  buildEditorCanvasLayout,
  buildEditorCanvasZoomViewData,
  resetEditorCanvasZoomState,
  selectShowEditorRightPanelState,
  setEditorCanvasZoomState,
  zoomEditorCanvasInState,
  zoomEditorCanvasOutState,
} from "../../src/internal/ui/editorCanvasWorkspace.js";

const createState = ({ isTouchMode = false, width = 0, height = 0 } = {}) => ({
  isTouchMode,
  appWindowMetrics: { width, height },
  canvasZoom: 1,
});

describe("editor canvas workspace", () => {
  it("steps the zoom through its levels and keeps gestures in range", () => {
    const state = createState();

    zoomEditorCanvasInState(state);
    expect(state.canvasZoom).toBe(1.5);
    zoomEditorCanvasOutState(state);
    zoomEditorCanvasOutState(state);
    expect(state.canvasZoom).toBe(0.75);

    setEditorCanvasZoomState(state, { zoom: 40 });
    expect(buildEditorCanvasZoomViewData(state.canvasZoom)).toEqual({
      canvasZoom: 10,
      canvasZoomLabel: "1000%",
      canvasZoomInDisabled: true,
      canvasZoomOutDisabled: false,
    });
    setEditorCanvasZoomState(state, { zoom: 0 });
    expect(state.canvasZoom).toBe(0.1);
    resetEditorCanvasZoomState(state);
    expect(state.canvasZoom).toBe(1);
  });

  it("keeps the right panel on desktop and tablet landscape only", () => {
    expect(selectShowEditorRightPanelState({ state: createState() })).toBe(
      true,
    );
    expect(
      selectShowEditorRightPanelState({
        state: createState({ isTouchMode: true, width: 1133, height: 744 }),
      }),
    ).toBe(true);
    expect(
      selectShowEditorRightPanelState({
        state: createState({ isTouchMode: true, width: 744, height: 1133 }),
      }),
    ).toBe(false);
  });

  it("fits the canvas of the given resolution to the workspace", () => {
    const resolution = { width: 800, height: 800 };

    expect(
      buildEditorCanvasLayout({ state: createState(), resolution })
        .canvasWrapperStyle,
    ).toContain("width: calc(min(100%, 92cqh) * var(--canvas-zoom, 1));");
    expect(
      buildEditorCanvasLayout({
        state: createState({ isTouchMode: true, width: 390, height: 844 }),
        resolution,
      }),
    ).toEqual({
      canvasBackgroundStyle: "",
      canvasWrapperStyle:
        "position: relative; width: min(100%, 50cqh); margin-left: auto; margin-right: auto;",
    });
  });
});
