import { describe, expect, it } from "vitest";
import {
  createInitialState,
  removeBlurOption,
  removeOpacityOption,
  selectBlurOptionEnabled,
  selectOpacityOptionEnabled,
  selectScreenBlur,
  selectScreenBlurActionValue,
  selectScreenOpacity,
  selectViewData,
  setAnimations,
  setFormValues,
  setScreenOptionVisibility,
  showBlurOption,
  showOpacityOption,
} from "../../src/components/commandLineScreen/commandLineScreen.store.js";
import { EN_I18N } from "../support/i18n.js";

const DEFAULT_EXPECTED_BLUR = {
  x: 6,
  y: 9,
  quality: 3,
  kernelSize: 9,
  repeatEdgePixels: true,
};

const findFormField = (fields, predicate) => {
  for (const field of fields) {
    if (predicate(field)) {
      return field;
    }
    if (field.fields) {
      const nestedField = findFormField(field.fields, predicate);
      if (nestedField) {
        return nestedField;
      }
    }
  }
  return undefined;
};

describe("commandLineScreen.store", () => {
  it("uses the current screen animation as the initial form value", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      i18n: EN_I18N,
      state,
      props: {
        screen: {
          animations: {
            resourceId: "screen-crossfade",
          },
        },
      },
    });

    expect(viewData.formKey).toBe("screen-crossfade");
    expect(viewData.defaultValues.transitionAnimationId).toBe(
      "screen-crossfade",
    );
    expect(viewData.form.fields[0]).toEqual(
      expect.objectContaining({
        clearable: true,
        label: "Animation",
        placeholder: "Animation",
      }),
    );
    expect(viewData.form.fields[0].required).toBeUndefined();
    expect(viewData.form.fields[1]).toMatchObject({
      $when: "transitionAnimationId",
      type: "row",
      fields: [
        {
          name: "playbackSpeed",
          label: "Playback Speed",
          type: "slider-with-input",
          min: 0.01,
          max: 4,
          step: 0.01,
          required: true,
        },
        {
          name: "playbackContinuity",
          label: "Continuity",
          type: "segmented-control",
          clearable: false,
        },
      ],
    });
    expect(viewData.form.fields.at(-1)).toEqual({
      type: "section",
      id: "options",
      label: "Options",
      action: {
        id: "add",
        icon: "plus",
        label: "Add Option",
      },
      fields: [],
    });
    expect(viewData.defaultValues.opacity).toBe(1);
    expect(viewData.defaultValues.blur).toBe(false);
    expect(viewData.defaultValues.blurX).toBe(6);
    expect(viewData.defaultValues.blurY).toBe(9);
    expect(viewData.defaultValues.blurQuality).toBe(3);
    expect(viewData.defaultValues.blurKernelSize).toBe(9);
    expect(viewData.defaultValues.blurRepeatEdgePixels).toBe(true);
  });

  it("offers transition animations for the screen transition picker", () => {
    const state = createInitialState();

    setAnimations(
      { state },
      {
        animations: {
          items: {
            "fade-in": {
              id: "fade-in",
              type: "animation",
              name: "Fade In",
              animation: {
                type: "transition",
              },
            },
            "pulse-update": {
              id: "pulse-update",
              type: "animation",
              name: "Pulse",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "fade-in" }, { id: "pulse-update" }],
        },
      },
    );
    setFormValues(
      { state },
      {
        values: {
          transitionAnimationId: "fade-in",
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N, props: {} });

    expect(viewData.context.transitionAnimationOptions).toEqual([
      {
        value: "fade-in",
        label: "Fade In",
        suffixText: "Transition",
      },
    ]);
    expect(viewData.defaultValues.transitionAnimationId).toBe("fade-in");
  });

  it("keeps a cleared screen animation empty instead of falling back to props", () => {
    const state = createInitialState();

    setFormValues(
      { state },
      {
        values: {
          transitionAnimationId: undefined,
        },
      },
    );

    const viewData = selectViewData({
      i18n: EN_I18N,
      state,
      props: {
        screen: {
          animations: {
            resourceId: "screen-crossfade",
          },
        },
      },
    });

    expect(viewData.defaultValues.transitionAnimationId).toBeUndefined();
  });

  it("uses selected screen opacity and blur values", () => {
    const state = createInitialState();

    setScreenOptionVisibility(
      { state },
      { opacityEnabled: true, blurEnabled: true, blurExplicit: true },
    );
    setFormValues(
      { state },
      {
        values: {
          transitionAnimationId: "screen-crossfade",
          opacity: "0.45",
          blur: true,
          blurX: "8",
          blurY: 10,
          blurQuality: 4,
          blurKernelSize: 11,
          blurRepeatEdgePixels: false,
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N, props: {} });

    expect(viewData.defaultValues.opacity).toBe(0.45);
    expect(viewData.defaultValues.blur).toBe(true);
    expect(viewData.defaultValues.blurX).toBe(8);
    expect(viewData.defaultValues.blurY).toBe(10);
    expect(viewData.defaultValues.blurQuality).toBe(4);
    expect(viewData.defaultValues.blurKernelSize).toBe(11);
    expect(viewData.defaultValues.blurRepeatEdgePixels).toBe(false);
    expect(selectScreenOpacity({ state })).toBe(0.45);
    expect(selectScreenBlur({ state })).toEqual({
      x: 8,
      y: 10,
      quality: 4,
      kernelSize: 11,
      repeatEdgePixels: false,
    });

    const optionsSection = viewData.form.fields.at(-1);
    expect(optionsSection.action).toBeUndefined();
    expect(optionsSection.fields.map((field) => field.id)).toEqual([
      "opacity",
      "blur",
    ]);
    expect(optionsSection.fields[0]).toMatchObject({
      type: "section",
      id: "opacity",
      label: "Opacity",
      action: { id: "remove", icon: "x", label: "Remove" },
      fields: [
        {
          name: "opacity",
          type: "slider-with-input",
          min: 0,
          max: 1,
          step: 0.01,
        },
      ],
    });
    expect(optionsSection.fields[1]).toMatchObject({
      type: "section",
      id: "blur",
      label: "Blur",
      action: { id: "remove", icon: "x", label: "Remove" },
    });
    expect(
      findFormField(optionsSection.fields, (field) => {
        return field.name === "blurKernelSize";
      }),
    ).toEqual({
      name: "blurKernelSize",
      label: "Kernel Size",
      type: "select",
      noClear: true,
      required: true,
      options: [
        { value: 5, label: "5" },
        { value: 7, label: "7" },
        { value: 9, label: "9" },
        { value: 11, label: "11" },
        { value: 13, label: "13" },
        { value: 15, label: "15" },
      ],
    });
  });

  it("adds and removes screen options independently", () => {
    const state = createInitialState();

    showOpacityOption({ state });
    expect(selectOpacityOptionEnabled({ state })).toBe(true);
    expect(selectScreenOpacity({ state })).toBe(1);

    showBlurOption({ state });
    expect(selectBlurOptionEnabled({ state })).toBe(true);
    expect(selectScreenBlur({ state })).toEqual(DEFAULT_EXPECTED_BLUR);

    removeOpacityOption({ state });
    removeBlurOption({ state });
    expect(selectOpacityOptionEnabled({ state })).toBe(false);
    expect(selectScreenOpacity({ state })).toBeUndefined();
    expect(selectBlurOptionEnabled({ state })).toBe(false);
    expect(selectScreenBlurActionValue({ state })).toBeNull();
  });

  it("uses screen effect props before form values are set", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      i18n: EN_I18N,
      state,
      props: {
        screen: {
          animations: {
            resourceId: "screen-crossfade",
          },
          opacity: 0.75,
          blur: {
            x: 7,
            y: 8,
            quality: 2,
            kernelSize: 13,
            repeatEdgePixels: false,
          },
        },
      },
    });

    expect(viewData.defaultValues.opacity).toBe(0.75);
    expect(viewData.defaultValues.blur).toBe(true);
    expect(viewData.defaultValues.blurX).toBe(7);
    expect(viewData.defaultValues.blurY).toBe(8);
    expect(viewData.defaultValues.blurQuality).toBe(2);
    expect(viewData.defaultValues.blurKernelSize).toBe(13);
    expect(viewData.defaultValues.blurRepeatEdgePixels).toBe(false);
  });

  it("uses screen blur null props as an explicit clear value", () => {
    const state = createInitialState();

    setScreenOptionVisibility(
      { state },
      { opacityEnabled: false, blurEnabled: false, blurExplicit: true },
    );
    setFormValues(
      { state },
      {
        values: {
          blur: false,
        },
      },
    );

    const viewData = selectViewData({
      i18n: EN_I18N,
      state,
      props: {
        screen: {
          blur: null,
        },
      },
    });

    expect(viewData.defaultValues.blur).toBe(false);
    expect(selectScreenBlurActionValue({ state })).toBeNull();
  });

  it("normalizes invalid screen blur kernel size to a supported option", () => {
    const state = createInitialState();

    setScreenOptionVisibility(
      { state },
      { opacityEnabled: false, blurEnabled: true, blurExplicit: true },
    );
    setFormValues(
      { state },
      {
        values: {
          blur: true,
          blurKernelSize: 12,
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N, props: {} });

    expect(viewData.defaultValues.blurKernelSize).toBe(11);
    expect(selectScreenBlur({ state })?.kernelSize).toBe(11);
  });
});
