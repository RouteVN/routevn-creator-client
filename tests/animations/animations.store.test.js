import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAnimationPreviewVisible,
  setImagesData,
  setItems,
  setProjectResolution,
  setSelectedItemId,
} from "../../src/pages/animations/animations.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("animations.store", () => {
  it("exposes the selected animation preview metadata for the detail panel", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        data: {
          items: {
            "fade-in": {
              id: "fade-in",
              type: "animation",
              name: "Fade In",
              thumbnailFileId: "file-preview",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "fade-in" }],
        },
      },
    );
    setSelectedItemId(
      { state },
      {
        itemId: "fade-in",
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.editButton).toBe("Edit");
    expect(viewData).not.toHaveProperty("selectedAnimationPreviewFileId");
    expect(viewData.selectedAnimationPreviewAspectRatio).toBe("1920 / 1080");
    expect(viewData.animationPreviewOpacity).toBe(0);

    setAnimationPreviewVisible(
      { state },
      {
        visible: true,
      },
    );

    expect(
      selectViewData({ state, i18n: EN_I18N }).animationPreviewOpacity,
    ).toBe(1);
  });

  it("supplies resolution-aware defaults to catalog timelines", () => {
    const state = createInitialState();
    setProjectResolution(
      { state },
      { projectResolution: { width: 1280, height: 720 } },
    );
    setItems(
      { state },
      {
        data: {
          items: {
            fade: {
              id: "fade",
              type: "animation",
              name: "Fade",
              animation: {
                type: "update",
                tween: {
                  alpha: {
                    keyframes: [{ duration: 1000, value: 0 }],
                  },
                },
              },
            },
          },
          tree: [{ id: "fade" }],
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const animationItem = viewData.catalogGroups
      .flatMap((group) => group.children)
      .find((item) => item.id === "fade");

    expect(animationItem.timelineDefaultValues).toMatchObject({
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      x: 640,
      y: 360,
    });
  });

  it("supplies normalized mask progress keyframes to transition catalog timelines", () => {
    const state = createInitialState();
    setImagesData(
      { state },
      {
        imagesData: {
          items: {
            "mask-image": {
              id: "mask-image",
              type: "image",
              name: "Wipe Mask",
              fileId: "mask.png",
              thumbnailFileId: "mask-thumbnail.png",
            },
          },
          tree: [{ id: "mask-image" }],
        },
      },
    );
    setItems(
      { state },
      {
        data: {
          items: {
            wipe: {
              id: "wipe",
              type: "animation",
              name: "Wipe",
              animation: {
                type: "transition",
                mask: {
                  kind: "single",
                  imageId: "mask-image",
                  progressDuration: 1000,
                  progressEasing: "linear",
                },
              },
            },
          },
          tree: [{ id: "wipe" }],
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const animationItem = viewData.catalogGroups
      .flatMap((group) => group.children)
      .find((item) => item.id === "wipe");

    expect(animationItem.maskTimelineRows).toEqual([
      {
        label: "Mask",
        properties: {
          progress: {
            initialValue: 0,
            keyframes: [
              {
                duration: 1000,
                value: 1,
                easing: "linear",
              },
            ],
            thumbnail: true,
            thumbnailBorderColor: "bo",
            thumbnailFileId: "mask-thumbnail.png",
            thumbnailName: "Wipe Mask",
          },
        },
      },
    ]);
    expect(animationItem.maskTimelineDefaultValues).toEqual({ progress: 0 });
    expect(animationItem.transitionTimelineDuration).toBe(1000);
  });
});
