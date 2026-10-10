import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildEditorCanvasLayout,
  buildEditorCanvasZoomViewData,
  buildEditorPanelPlacementViewData,
  resetEditorCanvasZoomState,
  selectShowEditorRightPanelState,
  setEditorCanvasZoomState,
  zoomEditorCanvasInState,
  zoomEditorCanvasOutState,
} from "../../src/internal/ui/editorCanvasWorkspace.js";

const createState = ({
  isTouchMode = false,
  width = 0,
  height = 0,
  rightPanelMode = "edit",
} = {}) => ({
  isTouchMode,
  appWindowMetrics: { width, height },
  canvasZoom: 1,
  rightPanelMode,
});

const readEditorView = (page) =>
  readFileSync(
    new URL(`../../src/pages/${page}/${page}.view.yaml`, import.meta.url),
    "utf8",
  );

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
  it("puts the Edit and Preview tabs in the navbar on phones, and undo and redo under the canvas in Edit only", () => {
    const placement = (options) =>
      buildEditorPanelPlacementViewData({ state: createState(options) });
    const phone = { isTouchMode: true, width: 390, height: 844 };

    expect(placement(phone)).toEqual({
      showRightPanel: false,
      showMobilePanels: true,
      showNavbarEditHistory: false,
      showNavbarPanelModeTabs: true,
      showMobilePanelHeader: true,
      showPanelModeTabs: false,
      showPanelEditHistory: true,
    });
    // The header under the canvas would be empty in Preview.
    expect(placement({ ...phone, rightPanelMode: "preview" })).toMatchObject({
      showNavbarPanelModeTabs: true,
      showMobilePanelHeader: false,
      showPanelEditHistory: false,
    });

    const tabletLayout = {
      showNavbarEditHistory: true,
      showNavbarPanelModeTabs: false,
      showMobilePanelHeader: true,
      showPanelModeTabs: true,
      showPanelEditHistory: false,
    };
    // Tablet portrait keeps the tabs over the panel under the canvas.
    expect(
      placement({ isTouchMode: true, width: 744, height: 1133 }),
    ).toMatchObject({ showMobilePanels: true, ...tabletLayout });
    expect(
      placement({ isTouchMode: true, width: 1133, height: 744 }),
    ).toMatchObject({ showRightPanel: true, ...tabletLayout });
    expect(placement({ width: 390, height: 844 })).toMatchObject({
      showRightPanel: true,
      ...tabletLayout,
    });
  });

  it.each(["particleEditor", "textStyleEditor", "transformEditor"])(
    "places the tabs and undo and redo in %s's view by those flags",
    (page) => {
      const view = readEditorView(page);
      const tabs =
        "rtgl-tabs#rightPanelModeTabs s=sm selected-tab=${rightPanelMode} :items=${rightPanelModeTabs}: null";

      // The navbar: undo and redo, or the tabs after the name.
      const navbar = view.slice(
        view.indexOf("rtgl-button#backButton"),
        view.indexOf("$if showMobilePanels:"),
      );
      const navbarTabs = navbar.indexOf("$if showNavbarPanelModeTabs:");
      expect(navbar.indexOf("$if showNavbarEditHistory:")).toBeGreaterThan(-1);
      expect(navbar.indexOf("rtgl-button#undoButton")).toBeGreaterThan(
        navbar.indexOf("$if showNavbarEditHistory:"),
      );
      expect(navbarTabs).toBeGreaterThan(navbar.indexOf("rtgl-text w=f"));
      expect(navbar.indexOf(tabs, navbarTabs)).toBeGreaterThan(navbarTabs);

      // The header under the canvas: the tabs, or undo and redo on the right.
      const panel = view.slice(
        view.indexOf("$if showMobilePanels:"),
        view.indexOf("$if showRightPanel:"),
      );
      const header = panel.slice(
        panel.indexOf("$if showMobilePanelHeader:"),
        panel.indexOf("${rightPanelEditStyle}"),
      );
      expect(header.indexOf("$if showPanelModeTabs:")).toBeGreaterThan(-1);
      expect(header.indexOf(tabs)).toBeGreaterThan(
        header.indexOf("$if showPanelModeTabs:"),
      );
      expect(header.indexOf("$if showPanelEditHistory:")).toBeGreaterThan(
        header.indexOf(tabs),
      );
      expect(header).toContain("rtgl-button#undoButton");
      expect(header).toContain("rtgl-button#redoButton");

      // The right panel keeps its tabs.
      expect(view.slice(view.indexOf("$if showRightPanel:"))).toContain(tabs);
    },
  );
});
