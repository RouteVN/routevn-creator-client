import { describe, expect, it } from "vitest";
import { produce } from "immer";
import { PREVIEW_TRANSITION_ELEMENT_ID } from "../../src/pages/animationEditor/animationEditor.constants.js";
import {
  commitPendingTransitionMask,
  createInitialState,
  enableTransitionMask,
  openDialog,
  selectAnimationRenderStateWithAnimations,
  selectAnimationResetState,
  selectPreviewData,
  selectViewData,
  setImages,
  setPopover,
  setPreviewImage,
  setProjectResolution,
  setTransitionMaskImage,
  startPendingTransitionMask,
} from "../../src/pages/animationEditor/animationEditor.store.js";

describe("animationEditor.store", () => {
  it("does not show Mask in the transition Add menu", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });

    const viewData = selectViewData({ state });

    expect(viewData.transitionAddPropertyButtonVisible).toBe(true);
    expect(viewData.addPropertySideMenuItems).not.toContainEqual({
      label: "Mask",
      type: "item",
      value: "mask",
    });
  });

  it("opens the dialog for mask editing", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    enableTransitionMask({ state });
    setPopover(
      { state },
      {
        mode: "editMask",
        x: 20,
        y: 40,
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.popover.popoverIsOpen).toBe(false);
    expect(viewData.popover.maskDialogIsOpen).toBe(true);
    expect(viewData.popover.mode).toBe("editMask");
  });

  it("keeps the timeline mask summary hidden while adding a pending mask", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    startPendingTransitionMask({ state });
    setPopover(
      { state },
      {
        mode: "addMask",
        x: 20,
        y: 40,
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.transitionMaskPanel.enabled).toBe(false);
    expect(viewData.maskEditorPanel.enabled).toBe(true);
    expect(viewData.popover.popoverIsOpen).toBe(false);
    expect(viewData.popover.maskDialogIsOpen).toBe(true);
    expect(viewData.popover.mode).toBe("addMask");
  });

  it("commits a pending mask inside Immer-backed store actions", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    startPendingTransitionMask({ state });

    const nextState = produce(state, (draftState) => {
      commitPendingTransitionMask({ state: draftState });
    });

    expect(nextState.transitionMask.kind).toBe("single");
    expect(nextState.pendingTransitionMask).toBeUndefined();
  });

  it("includes the mask image data in the read-only mask panel", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    enableTransitionMask({ state });
    setImages(
      { state },
      {
        images: {
          tree: [],
          items: {
            mask: {
              type: "image",
              name: "Feather Mask",
              fileId: "file-mask",
              thumbnailFileId: "thumb-mask",
              width: 800,
              height: 600,
            },
          },
        },
      },
    );
    setTransitionMaskImage(
      { state },
      {
        imageId: "mask",
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.transitionMaskPanel.singleImage).toMatchObject({
      imageId: "mask",
      previewFileId: "thumb-mask",
      previewAspectRatio: "800 / 600",
      name: "Feather Mask",
    });
    expect(viewData.transitionMaskPanel.imageItems).toEqual([
      expect.objectContaining({
        imageId: "mask",
        previewFileId: "thumb-mask",
        name: "Feather Mask",
      }),
    ]);
  });

  it("builds preview image slots for the right panel", () => {
    const state = createInitialState();
    setImages(
      { state },
      {
        images: {
          tree: [],
          items: {
            bg: {
              type: "image",
              name: "Background",
              fileId: "file-bg",
              thumbnailFileId: "thumb-bg",
            },
            incoming: {
              type: "image",
              name: "Incoming",
              fileId: "file-incoming",
              width: 1024,
              height: 768,
            },
          },
        },
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-background",
        imageId: "bg",
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-incoming",
        imageId: "incoming",
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.previewPanel.items).toEqual([
      expect.objectContaining({
        label: "BG Image",
        target: "preview-background",
        imageLabel: "Background",
        image: expect.objectContaining({
          previewFileId: "thumb-bg",
        }),
      }),
      expect.objectContaining({
        label: "Outgoing Image",
        target: "preview-outgoing",
        imageLabel: "Select image",
      }),
      expect.objectContaining({
        label: "Incoming Image",
        target: "preview-incoming",
        imageLabel: "Incoming",
        image: expect.objectContaining({
          previewFileId: "file-incoming",
          previewAspectRatio: "1024 / 768",
        }),
      }),
    ]);
  });

  it("stores preview data in transform-ready slots", () => {
    const state = createInitialState();
    openDialog(
      { state },
      {
        editMode: true,
        itemId: "animation-1",
        itemData: {
          name: "Fade",
          description: "",
          animation: {
            type: "transition",
          },
          preview: {
            background: {
              imageId: "bg",
            },
            outgoing: {
              imageId: "outgoing",
              transformId: "transform-out",
            },
            incoming: {
              imageId: "incoming",
              transformId: "transform-in",
            },
          },
        },
      },
    );

    expect(selectPreviewData({ state })).toEqual({
      background: {
        imageId: "bg",
      },
      outgoing: {
        imageId: "outgoing",
        transformId: "transform-out",
      },
      incoming: {
        imageId: "incoming",
        transformId: "transform-in",
      },
    });
  });

  it("uses preview images in transition render states", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });
    setProjectResolution(
      { state },
      {
        projectResolution: {
          width: 1920,
          height: 1080,
        },
      },
    );
    setImages(
      { state },
      {
        images: {
          tree: [],
          items: {
            bg: {
              type: "image",
              name: "Background",
              fileId: "file-bg",
              width: 1920,
              height: 1080,
            },
            outgoing: {
              type: "image",
              name: "Outgoing",
              fileId: "file-outgoing",
              width: 800,
              height: 600,
            },
            incoming: {
              type: "image",
              name: "Incoming",
              fileId: "file-incoming",
              width: 1024,
              height: 768,
            },
          },
        },
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-background",
        imageId: "bg",
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-outgoing",
        imageId: "outgoing",
      },
    );
    setPreviewImage(
      { state },
      {
        target: "preview-incoming",
        imageId: "incoming",
      },
    );

    const resetState = selectAnimationResetState({ state });
    const renderState = selectAnimationRenderStateWithAnimations({ state });
    const resetTransitionElement = resetState.elements.find(
      (element) => element.id === PREVIEW_TRANSITION_ELEMENT_ID,
    );
    const renderTransitionElement = renderState.elements.find(
      (element) => element.id === PREVIEW_TRANSITION_ELEMENT_ID,
    );

    expect(resetState.elements[0]).toMatchObject({
      id: "bg",
      type: "sprite",
      src: "file-bg",
    });
    expect(resetTransitionElement).toMatchObject({
      type: "sprite",
      src: "file-outgoing",
      width: 800,
      height: 600,
    });
    expect(renderTransitionElement).toMatchObject({
      type: "sprite",
      src: "file-incoming",
      width: 1024,
      height: 768,
    });
  });

  it("uses black as the default incoming transition preview image", () => {
    const state = createInitialState();
    openDialog({ state }, { dialogType: "transition" });

    const renderState = selectAnimationRenderStateWithAnimations({ state });
    const renderTransitionElement = renderState.elements.find(
      (element) => element.id === PREVIEW_TRANSITION_ELEMENT_ID,
    );

    expect(renderTransitionElement).toMatchObject({
      type: "rect",
      fill: "#000000",
    });
  });
});
