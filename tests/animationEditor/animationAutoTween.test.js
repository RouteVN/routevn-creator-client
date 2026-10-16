import { describe, expect, it, vi } from "vitest";
import { rectPlugin, spritePlugin } from "route-graphics";
import { UPDATE_PROPERTY_KEYS } from "../../src/pages/animationEditor/animationEditor.constants.js";
import {
  addProperty,
  createInitialState,
  openDialog,
  selectAnimationRenderStateWithAnimations,
  selectViewData,
  setImages,
  setPopover,
  setPreviewImage,
  updatePopoverFormValues,
} from "../../src/pages/animationEditor/animationEditor.store.js";
import { createAnimationResourcePreviewStates } from "../../src/internal/animationPreview.js";
import { EN_I18N } from "../support/i18n.js";

// Route Graphics references the browser's Worker when it loads. Parsing
// element state, which these tests use, never starts one.
vi.hoisted(() => {
  globalThis.Worker ??= class Worker {};
});

const AUTO = { auto: { duration: 400, easing: "linear" } };
const AUTO_PROPERTIES = ["alpha", "x", "y", "scaleX", "scaleY", "rotation"];
const NON_AUTO_PROPERTIES = ["translateX", "translateY", "blurX", "blurY"];
const ELEMENT_PLUGINS = { rect: rectPlugin, sprite: spritePlugin };

// Route Graphics resolves an Auto tween from the target element's parsed
// state and stops with "cannot auto-resolve property" when the state has no
// such property. Returns the Auto properties that would stop the render.
const findUnresolvableAutoProperties = (renderState) => {
  return renderState.animations.flatMap((animation) => {
    const element = renderState.elements.find(
      (item) => item.id === animation.targetId,
    );
    const targetState = ELEMENT_PLUGINS[element.type].parse({
      state: element,
    });
    return Object.entries(animation.tween ?? {})
      .filter(
        ([property, config]) =>
          config.auto && !Object.hasOwn(targetState, property),
      )
      .map(([property]) => property);
  });
};

const createUpdateEditorState = (tween) => {
  const state = createInitialState();
  openDialog({ state }, { dialogType: "update" });
  state.tweenBySection.update = structuredClone(tween);
  return state;
};

const selectAddPropertyFieldNames = (property) => {
  const state = createInitialState();
  openDialog({ state }, { dialogType: "update" });
  setPopover({ state }, { mode: "addProperty", payload: { side: "update" } });
  updatePopoverFormValues({ state }, { formValues: { property } });
  return selectViewData({ state, i18n: EN_I18N }).addPropertyForm.fields.map(
    (field) => field.name,
  );
};

describe("Auto tweens in the animation editor", () => {
  it("covers every update property", () => {
    expect(
      [...AUTO_PROPERTIES, ...NON_AUTO_PROPERTIES, "camera"].sort(),
    ).toEqual([...UPDATE_PROPERTY_KEYS].sort());
  });

  it.each(AUTO_PROPERTIES)("offers Auto for %s", (property) => {
    expect(selectAddPropertyFieldNames(property)).toContain("tweenMode");
  });

  it.each(NON_AUTO_PROPERTIES)(
    "offers only keyframes for %s, which Auto cannot resolve",
    (property) => {
      const fieldNames = selectAddPropertyFieldNames(property);

      expect(fieldNames).not.toContain("tweenMode");
      expect(fieldNames).toContain("initialValueType");
    },
  );

  it("adds keyframes when Auto is asked for a property it cannot resolve", () => {
    const state = createUpdateEditorState({});

    addProperty(
      { state },
      { side: "update", property: "translateX", tweenMode: "auto" },
    );
    addProperty(
      { state },
      { side: "update", property: "alpha", tweenMode: "auto" },
    );

    expect(state.tweenBySection.update.translateX).toEqual({ keyframes: [] });
    expect(state.tweenBySection.update.alpha).toEqual({
      auto: { duration: 1000, easing: "linear" },
    });
  });

  it.each([
    ["the placeholder", false],
    ["a preview image", true],
  ])("lets every offered Auto tween resolve on %s", (_label, withImage) => {
    const state = createUpdateEditorState(
      Object.fromEntries(AUTO_PROPERTIES.map((property) => [property, AUTO])),
    );
    if (withImage) {
      setImages(
        { state },
        {
          images: {
            items: {
              target: {
                type: "image",
                name: "Target",
                fileId: "target-file",
                width: 320,
                height: 640,
              },
            },
          },
        },
      );
      setPreviewImage(
        { state },
        { target: "preview-target", imageId: "target" },
      );
    }

    const renderState = selectAnimationRenderStateWithAnimations({ state });

    expect(renderState.animations).toHaveLength(AUTO_PROPERTIES.length);
    expect(findUnresolvableAutoProperties(renderState)).toEqual([]);
  });

  it("does not preview Auto tweens saved on properties Auto cannot resolve", () => {
    const state = createUpdateEditorState({
      translateX: AUTO,
      blurY: AUTO,
      alpha: AUTO,
    });

    const renderState = selectAnimationRenderStateWithAnimations({ state });

    expect(
      renderState.animations.map(({ tween }) => Object.keys(tween)),
    ).toEqual([["alpha"]]);
    expect(findUnresolvableAutoProperties(renderState)).toEqual([]);
  });

  it("lets the Animations page preview play saved Auto tweens", () => {
    const { renderState } = createAnimationResourcePreviewStates({
      animationItem: {
        type: "animation",
        animation: {
          type: "update",
          tween: {
            scaleX: AUTO,
            scaleY: AUTO,
            translateY: AUTO,
          },
        },
      },
      imagesData: { items: {}, tree: [] },
      projectResolution: { width: 1920, height: 1080 },
    });

    expect(renderState.animations).toHaveLength(2);
    expect(findUnresolvableAutoProperties(renderState)).toEqual([]);
  });
});
