import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectScreenBlur,
  selectScreenOpacity,
  selectViewData,
  setAnimations,
  setFormValues,
} from "../../src/components/commandLineScreen/commandLineScreen.store.js";

describe("commandLineScreen.store", () => {
  it("uses the current screen animation as the initial form value", () => {
    const state = createInitialState();

    const viewData = selectViewData({
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
    expect(
      viewData.form.fields.find((field) => field.name === "opacity"),
    ).toEqual(
      expect.objectContaining({
        label: "Opacity",
        type: "slider-with-input",
        min: 0,
        max: 1,
        step: 0.01,
      }),
    );
    expect(viewData.form.fields.find((field) => field.name === "blur")).toEqual(
      expect.objectContaining({
        label: "Blur",
        type: "segmented-control",
        clearable: false,
        options: [
          {
            value: false,
            label: "No Blur",
          },
          {
            value: true,
            label: "Blur",
          },
        ],
      }),
    );
    expect(
      viewData.form.fields.find((field) => field.name === "blurKernelSize"),
    ).toEqual(
      expect.objectContaining({
        $when: "blur == true",
        label: "Kernel Size",
        type: "select",
        options: [
          { value: 5, label: "5" },
          { value: 7, label: "7" },
          { value: 9, label: "9" },
          { value: 11, label: "11" },
          { value: 13, label: "13" },
          { value: 15, label: "15" },
        ],
      }),
    );
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

    const viewData = selectViewData({ state, props: {} });

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

    const viewData = selectViewData({ state, props: {} });

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
  });

  it("uses screen effect props before form values are set", () => {
    const state = createInitialState();

    const viewData = selectViewData({
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

  it("normalizes invalid screen blur kernel size to a supported option", () => {
    const state = createInitialState();

    setFormValues(
      { state },
      {
        values: {
          blur: true,
          blurKernelSize: 12,
        },
      },
    );

    const viewData = selectViewData({ state, props: {} });

    expect(viewData.defaultValues.blurKernelSize).toBe(11);
    expect(selectScreenBlur({ state })?.kernelSize).toBe(11);
  });
});
