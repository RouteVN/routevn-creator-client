import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setUiConfig,
} from "../../src/components/actionTransformEditor/actionTransformEditor.store.js";
import { EN_I18N } from "../support/i18n.js";

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
      isTouchMode: false,
      targetTypeLabel: "Visual",
      targetName: "Window Light",
      canvasAspectRatio: "16 / 9",
      canvasMaxWidth: "min(100%, 88.8889vh)",
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

  it("uses the touch layout when the component receives touch UI config", () => {
    const state = createInitialState();

    setUiConfig(
      { state },
      {
        uiConfig: {
          id: "touch",
        },
      },
    );

    expect(
      selectViewData({ state, props: {}, i18n: EN_I18N }).isTouchMode,
    ).toBe(true);
  });
});
