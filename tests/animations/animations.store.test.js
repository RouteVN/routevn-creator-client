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
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";
import { JSDOM } from "jsdom";
import * as timeline from "../../src/components/keyframeTimeline/keyframeTimeline.store.js";
import { renderViewYaml } from "../support/renderView.js";

const createCameraItem = (side) => {
  const initial = { x: 960, y: 540, scaleX: 1, scaleY: 1 };
  const start = { x: 970, y: 550, scaleX: 1.1, scaleY: 1.1 };
  const end = { x: 980, y: 560, scaleX: 1.25, scaleY: 1.25 };
  const tween = Object.fromEntries(
    Object.keys(initial).map((property) => [
      property,
      {
        initialValue: initial[property],
        keyframes: [
          {
            delay: 100,
            duration: 900,
            easing: "easeInQuad",
            startValue: start[property],
            value: end[property],
          },
        ],
      },
    ]),
  );
  tween.alpha = { keyframes: [{ duration: 500, value: 0.5 }] };
  const animation = { type: side === "update" ? "update" : "transition" };
  if (side === "update") animation.tween = tween;
  else {
    animation[side] = { tween };
    animation[side === "prev" ? "next" : "prev"] = {
      tween: structuredClone(tween),
    };
  }
  return {
    id: "camera-one",
    type: "animation",
    name: "Camera One",
    cameraTracks: [side],
    animation,
  };
};

const catalogItem = (item, i18n = EN_I18N) => {
  const state = createInitialState();
  setItems(
    { state },
    { data: { items: { [item.id]: item }, tree: [{ id: item.id }] } },
  );
  return selectViewData({ state, i18n })
    .catalogGroups.flatMap((group) => group.children)
    .find((child) => child.id === item.id);
};

describe("animations.store", () => {
  it.each(["update", "prev", "next"])(
    "shows authored %s Camera as one labeled timeline row without changing saved or unmarked tracks",
    (side) => {
      const item = createCameraItem(side);
      const before = structuredClone(item);
      const display = catalogItem(item);
      const properties = display[`${side}Properties`];
      expect(Object.keys(properties)).toEqual(["alpha", "camera"]);
      expect(properties.camera).toMatchObject({
        label: "Camera",
        valueCurveMode: "progress",
        initialValueLabel: "",
        keyframes: [
          {
            delay: 100,
            duration: 900,
            easing: "easeInQuad",
            startValueLabel: "110%",
            valueLabel: "125%",
          },
        ],
      });
      expect(display.duration).toBe(1000);
      expect(display.propertyCount).toBe(side === "update" ? 2 : 7);
      if (side !== "update") {
        const opposite = side === "prev" ? "next" : "prev";
        expect(display[`${opposite}Properties`]).toEqual(
          item.animation[opposite].tween,
        );
        expect(display.transitionTimelineDuration).toBe(1000);
      }
      expect(item).toEqual(before);
      expect(display.animation).toBe(item.animation);
      const fragment = JSDOM.fragment(
        renderViewYaml(
          "src/components/keyframeTimeline/keyframeTimeline.view.yaml",
          timeline.selectViewData({
            state: timeline.createInitialState(),
            props: { properties },
            i18n: EN_I18N,
          }),
        ),
      );
      expect(
        fragment.querySelectorAll("[data-keyframe=true][data-property=camera]"),
      ).toHaveLength(1);
      expect(
        fragment.querySelector(
          "[data-property=x], [data-property=y], [data-property=scaleX], [data-property=scaleY]",
        ),
      ).toBeNull();
      const path = fragment
        .querySelector("[data-value-curve=camera] path")
        .getAttribute("d");
      expect(path).not.toMatch(/NaN|Infinity/);
    },
  );

  it.each([undefined, []])(
    "keeps matching scalar tracks separate without Camera metadata %j",
    (cameraTracks) => {
      const item = createCameraItem("update");
      item.cameraTracks = cameraTracks;
      const display = catalogItem(item);
      expect(display.updateProperties).toEqual(item.animation.tween);
      expect(display.propertyCount).toBe(5);
    },
  );

  it.each([JA_I18N, ZH_HANS_I18N])(
    "uses the same localized Camera label as the editor",
    (i18n) => {
      const display = catalogItem(createCameraItem("update"), i18n);
      expect(display.updateProperties.camera.label).toBe(
        i18n.animationEditorPage.cameraPropertyLabel,
      );
    },
  );

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
