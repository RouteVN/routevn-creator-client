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
      isSceneEditorMobile: false,
      fullscreen: false,
      fullscreenHorizontalInset: "0px",
      dialogWidth: "800",
      dialogSize: undefined,
      dialogHeight: "80vh",
      dialogPadding: "lg",
      panelWidth: "50vw",
      panelTop: "0px",
      panelBottom: "0px",
      suppressClose: false,
      overlayHorizontalInset: "64px",
      overlayBackground: "rgba(0, 0, 0, 0.42)",
      panelHorizontalInset: "96px",
      panelWidthReduction: "64px",
      panelVerticalInset: "32px",
      panelMaxHeight: "800px",
    });
  });

  it("passes through padding-free dialogs", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: { dialogPadding: "none" },
    });

    expect(viewData.dialogPadding).toBe("none");
  });

  it("uses the md dialog size for touch-width content", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        dialogWidth: "100%",
      },
    });

    expect(viewData.dialogWidth).toBe("100%");
    expect(viewData.dialogSize).toBe("md");
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
        suppressClose: true,
      },
    });

    expect(viewData).toMatchObject({
      open: true,
      variant: "scene-editor-left",
      isSceneEditorLeft: true,
      panelWidth: "calc((100vw - 64px) / 2)",
      suppressClose: true,
      overlayHorizontalInset: "64px",
      overlayBackground: "rgba(0, 0, 0, 0.42)",
      panelHorizontalInset: "96px",
      panelWidthReduction: "64px",
      panelVerticalInset: "32px",
      panelMaxHeight: "800px",
    });
  });

  it("normalizes the bounded mobile scene editor panel", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        open: true,
        variant: "scene-editor-mobile",
        panelTop: "min(56.25vw, 50vh)",
        panelBottom: "0px",
      },
    });

    expect(viewData).toMatchObject({
      open: true,
      variant: "scene-editor-mobile",
      isSceneEditorLeft: false,
      isSceneEditorMobile: true,
      panelTop: "min(56.25vw, 50vh)",
      panelBottom: "0px",
    });
  });

  it("covers the viewport for a fullscreen scene editor surface", () => {
    const viewData = selectViewData({
      state: createInitialState(),
      props: {
        variant: "scene-editor-left",
        fullscreen: true,
      },
    });

    expect(viewData).toMatchObject({
      fullscreen: true,
      fullscreenHorizontalInset: "0px",
    });
  });
});
