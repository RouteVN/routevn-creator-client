import { describe, expect, it } from "vitest";
import {
  createInitialState,
  resetCanvasZoom,
  selectIsTouchLandscape,
  selectViewData,
  setCanvasZoom,
  setTouchLandscape,
  setUiConfig,
  zoomCanvasIn,
  zoomCanvasOut,
} from "../../src/components/actionTransformEditor/actionTransformEditor.store.js";
import { EN_I18N, ES_I18N } from "../support/i18n.js";

describe("actionTransformEditor.store", () => {
  it("builds a transform-only editor view for the selected target", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        targetType: "visual",
        targetName: "Window Light",
        projectResolution: {
          width: 1920,
          height: 1080,
        },
        transform: {
          x: 320,
          y: 180,
          anchorX: 0.5,
          anchorY: 1,
          scaleX: 1.25,
          scaleY: 0.8,
          rotation: 12,
        },
      },
      i18n: EN_I18N,
    });

    expect(viewData).toMatchObject({
      showTargetPanel: true,
      showRightPanel: true,
      canvasBackgroundStyle: expect.stringContaining("overflow: hidden"),
      canvasWrapperStyle: expect.stringContaining("min(100%, 163.5556cqh)"),
      targetTypeLabel: "Visual",
      targetName: "Window Light",
      canvasAspectRatio: "16 / 9",
      inspectorValues: {
        x: 320,
        y: 180,
        scaleX: 1.25,
        scaleY: 0.8,
        rotation: 12,
        anchor: {
          x: 0.5,
          y: 1,
        },
      },
    });
  });

  it("exposes selected element metrics for the background", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        targetType: "background",
        projectResolution: { width: 1920, height: 1080 },
        transform: {
          x: 384,
          y: 108,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        selectedElementMetrics: {
          width: 1920,
          height: 1080,
          renderedBounds: {
            corners: [
              { x: 192, y: 108 },
              { x: 2112, y: 108 },
              { x: 2112, y: 1188 },
              { x: 192, y: 1188 },
            ],
          },
        },
      },
      i18n: EN_I18N,
    });

    expect(viewData).toMatchObject({
      targetTypeLabel: "Background",
      selectedElementMetrics: {
        width: 1920,
        height: 1080,
      },
    });
  });

  it("stacks the inspector under the canvas on touch portrait and moves it beside the canvas on touch landscape", () => {
    const state = createInitialState();

    setUiConfig(
      { state },
      {
        uiConfig: {
          id: "touch",
        },
      },
    );

    const portrait = selectViewData({ state, props: {}, i18n: EN_I18N });
    expect(portrait).toMatchObject({
      showTargetPanel: false,
      showRightPanel: false,
    });
    // The canvas is fitted to half the height, with nothing to pan.
    expect(portrait.canvasBackgroundStyle).toBe("");
    expect(portrait.canvasWrapperStyle).toContain("min(100%, 88.8889cqh)");

    setTouchLandscape({ state }, { isTouchLandscape: true });

    const landscape = selectViewData({ state, props: {}, i18n: EN_I18N });
    expect(landscape).toMatchObject({
      showTargetPanel: false,
      showRightPanel: true,
    });
    // The canvas takes the rest of the workspace, where it zooms and pans.
    expect(landscape.canvasBackgroundStyle).toContain("overflow: hidden");
    expect(landscape.canvasWrapperStyle).toContain("min(100%, 163.5556cqh)");

    setTouchLandscape({ state }, { isTouchLandscape: false });

    expect(selectViewData({ state, props: {}, i18n: EN_I18N })).toMatchObject({
      showRightPanel: false,
    });
  });

  it("keeps the touch landscape flag it is given", () => {
    const state = createInitialState();

    expect(selectIsTouchLandscape({ state })).toBe(false);

    setTouchLandscape({ state }, { isTouchLandscape: true });
    expect(selectIsTouchLandscape({ state })).toBe(true);

    setTouchLandscape({ state }, { isTouchLandscape: false });
    expect(selectIsTouchLandscape({ state })).toBe(false);
  });

  describe("canvas zoom", () => {
    const select = (state, i18n = EN_I18N) =>
      selectViewData({ state, props: {}, i18n });

    it("zooms relative to the fitted canvas", () => {
      const state = createInitialState();
      expect(select(state)).toMatchObject({
        showCanvasZoomControls: true,
        canvasZoom: 1,
        canvasZoomLabel: "100%",
        canvasZoomInDisabled: false,
        canvasZoomOutDisabled: false,
      });

      zoomCanvasIn({ state });
      expect(select(state)).toMatchObject({
        canvasZoom: 1.5,
        canvasZoomLabel: "150%",
      });

      zoomCanvasOut({ state });
      zoomCanvasOut({ state });
      expect(select(state)).toMatchObject({
        canvasZoom: 0.75,
        canvasZoomLabel: "75%",
      });

      // A pinch or wheel zoom ends on any zoom in range, and the buttons
      // step on from it.
      setCanvasZoom({ state }, { zoom: 2.37 });
      expect(select(state)).toMatchObject({
        canvasZoom: 2.37,
        canvasZoomLabel: "237%",
      });
      zoomCanvasIn({ state });
      expect(select(state).canvasZoom).toBe(3);

      resetCanvasZoom({ state });
      expect(select(state)).toMatchObject({
        canvasZoom: 1,
        canvasZoomLabel: "100%",
      });
    });

    it("disables a zoom button at the end of its range", () => {
      const state = createInitialState();

      setCanvasZoom({ state }, { zoom: 40 });
      expect(select(state)).toMatchObject({
        canvasZoom: 10,
        canvasZoomInDisabled: true,
        canvasZoomOutDisabled: false,
      });

      setCanvasZoom({ state }, { zoom: 0 });
      expect(select(state)).toMatchObject({
        canvasZoom: 0.1,
        canvasZoomInDisabled: false,
        canvasZoomOutDisabled: true,
      });
    });

    it("shows a fitted canvas without zoom controls while the inspector is under it", () => {
      const state = createInitialState();
      zoomCanvasIn({ state });
      zoomCanvasIn({ state });
      setUiConfig({ state }, { uiConfig: { id: "touch" } });

      expect(select(state)).toMatchObject({
        showCanvasZoomControls: false,
        canvasZoom: 1,
        canvasZoomLabel: "100%",
      });

      // The zoom is kept for when the inspector moves back to the right.
      setTouchLandscape({ state }, { isTouchLandscape: true });
      expect(select(state)).toMatchObject({
        showCanvasZoomControls: true,
        canvasZoom: 2,
        canvasZoomLabel: "200%",
      });
    });

    it("names the zoom buttons in the interface language", () => {
      const state = createInitialState();

      expect(select(state)).toMatchObject({
        canvasZoomInLabel: "Zoom in",
        canvasZoomOutLabel: "Zoom out",
        canvasZoomFitLabel: "Fit to view",
      });
      expect(select(state, ES_I18N)).toMatchObject({
        canvasZoomInLabel: "Acercar",
        canvasZoomOutLabel: "Alejar",
        canvasZoomFitLabel: "Ajustar a la vista",
      });
    });
  });
});
