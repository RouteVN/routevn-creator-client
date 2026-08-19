import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setProjectResolution,
  setUiConfig,
  setViewportSize,
  togglePreviewRotation,
} from "../../src/components/vnPreview/vnPreview.store.js";

const I18N = {
  vnPreview: {
    restoreOrientationButton: "Restore orientation",
    rotateButton: "Rotate 90 degrees",
  },
};

describe("vnPreview.store", () => {
  it("fits the scene to swapped viewport dimensions when rotated", () => {
    const state = createInitialState();
    setProjectResolution(
      { state },
      { projectResolution: { width: 1920, height: 1080 } },
    );
    setViewportSize({ state }, { width: 360, height: 720 });
    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });

    const normalViewData = selectViewData({
      state,
      props: {},
      i18n: I18N,
    });

    expect(normalViewData).toMatchObject({
      isRotated: false,
      rotatePreviewLabel: "Rotate 90 degrees",
      showRotatePreviewButton: true,
    });
    expect(normalViewData.previewStageStyle).toContain("width: 360px");
    expect(normalViewData.previewStageStyle).toContain("height: 202.5px");
    expect(normalViewData.previewFrameStyle).toContain("width: 360px");
    expect(normalViewData.previewFrameStyle).toContain("height: 202.5px");
    expect(normalViewData.previewFrameStyle).toContain("rotate(0deg)");

    togglePreviewRotation({ state });
    const rotatedViewData = selectViewData({
      state,
      props: {},
      i18n: I18N,
    });

    expect(rotatedViewData).toMatchObject({
      isRotated: true,
      rotatePreviewLabel: "Restore orientation",
      showRotatePreviewButton: true,
    });
    expect(rotatedViewData.previewStageStyle).toContain("width: 360px");
    expect(rotatedViewData.previewStageStyle).toContain("height: 640px");
    expect(rotatedViewData.previewFrameStyle).toContain("width: 640px");
    expect(rotatedViewData.previewFrameStyle).toContain("height: 360px");
    expect(rotatedViewData.previewFrameStyle).toContain("rotate(90deg)");
  });

  it("keeps the rotate control hidden for desktop UI", () => {
    const state = createInitialState();

    expect(
      selectViewData({ state, props: {}, i18n: I18N }).showRotatePreviewButton,
    ).toBe(false);
  });
});
