import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAnimationPreviewVisible,
  setItems,
  setSelectedItemId,
} from "../../src/pages/animations/animations.store.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const createAnimationItem = (animation) => ({
  id: "animation-one",
  type: "animation",
  name: "Animation One",
  thumbnailFileId: "file-preview",
  animation,
});

const createStateWithItem = (item) => {
  const state = createInitialState();
  setItems(
    { state },
    { data: { items: { [item.id]: item }, tree: [{ id: item.id }] } },
  );
  return state;
};

const catalogItem = (item, i18n = EN_I18N) => {
  return selectViewData({ state: createStateWithItem(item), i18n })
    .catalogGroups.flatMap((group) => group.children)
    .find((child) => child.id === item.id);
};

describe("animations.store", () => {
  it.each([
    ["update", "Update"],
    ["transition", "Transition"],
  ])(
    "shows a %s animation as a grid card with its thumbnail",
    (type, typeInfo) => {
      expect(catalogItem(createAnimationItem({ type }))).toEqual({
        id: "animation-one",
        name: "Animation One",
        cardKind: "layout",
        cardVariant: "thumbnail",
        previewFileId: "file-preview",
        typeInfo,
      });
    },
  );

  it("shows a grid card with no thumbnail until one is drawn", () => {
    const item = createAnimationItem({ type: "update" });
    delete item.thumbnailFileId;

    expect(catalogItem(item).previewFileId).toBeUndefined();
  });

  it("localizes the type shown on a grid card", () => {
    const card = catalogItem(
      createAnimationItem({ type: "transition" }),
      JA_I18N,
    );

    expect(card.typeInfo).toBe(JA_I18N.animationsPage.transitionType);
  });

  it("shows the longest track as the selected animation's duration", () => {
    const state = createStateWithItem(
      createAnimationItem({
        type: "update",
        tween: {
          alpha: { keyframes: [{ duration: 500, value: 0.5 }] },
          x: { keyframes: [{ delay: 100, duration: 900, value: 980 }] },
        },
      }),
    );
    setSelectedItemId({ state }, { itemId: "animation-one" });

    expect(selectViewData({ state, i18n: EN_I18N }).selectedItemDuration).toBe(
      "1s",
    );
  });

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
});
