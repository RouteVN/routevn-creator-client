import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/systemActionsDialogSurface/systemActionsDialogSurface.store.js";

describe("systemActionsDialogSurface.store", () => {
  it("normalizes default dialog surface view data", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {},
    });

    expect(viewData).toEqual({
      open: false,
      variant: "default",
      isSceneEditorLeft: false,
      dialogWidth: "800",
      dialogHeight: "80vh",
      panelWidth: "50vw",
      panelHorizontalInset: "96px",
      panelWidthReduction: "64px",
      panelVerticalInset: "32px",
    });
  });

  it("normalizes the scene editor left panel variant", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        open: true,
        variant: "scene-editor-left",
        dialogWidth: "100vw",
        dialogHeight: "100vh",
        panelWidth: "calc((100vw - 64px) / 2)",
      },
    });

    expect(viewData).toMatchObject({
      open: true,
      variant: "scene-editor-left",
      isSceneEditorLeft: true,
      panelWidth: "calc((100vw - 64px) / 2)",
      panelHorizontalInset: "96px",
      panelWidthReduction: "64px",
      panelVerticalInset: "32px",
    });
  });
});
