import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setRepositoryState,
  setSelectedAnimation,
  setSelectedBlur,
  setSelectedOpacity,
  setSelectedResource,
  setSelectedTransform,
} from "../../src/components/commandLineBackground/commandLineBackground.store.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

describe("commandLineBackground.store", () => {
  it("uses a clearable animation select with type suffix text", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        images: {
          items: {
            "bg-school": {
              id: "bg-school",
              type: "image",
              name: "School",
              fileId: "file-school",
            },
          },
          tree: [{ id: "bg-school" }],
        },
        layouts: createEmptyCollection(),
        videos: createEmptyCollection(),
        animations: {
          items: {
            "bg-pan": {
              id: "bg-pan",
              type: "animation",
              name: "Pan",
              animation: {
                type: "update",
              },
            },
            "bg-fade": {
              id: "bg-fade",
              type: "animation",
              name: "Fade",
              animation: {
                type: "transition",
              },
            },
          },
          tree: [{ id: "bg-pan" }, { id: "bg-fade" }],
        },
        transforms: {
          items: {
            "bg-center": {
              id: "bg-center",
              type: "transform",
              name: "Center",
            },
          },
          tree: [{ id: "bg-center" }],
        },
      },
    );
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedTransform(
      { state },
      {
        transformId: "bg-center",
      },
    );
    const viewData = selectViewData({ state });
    const transformField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "transformId",
    );
    const animationField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "animationId",
    );
    const opacityField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "opacity",
    );
    const blurField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "blur",
    );
    const blurXField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "blurX",
    );
    const blurKernelSizeField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "blurKernelSize",
    );
    const continuityField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "playbackContinuity",
    );

    expect(transformField).toMatchObject({
      label: "Transform",
      type: "select",
      clearable: true,
      placeholder: "Select transform",
      options: [
        {
          value: "bg-center",
          label: "Center",
        },
      ],
    });
    expect(animationField).toMatchObject({
      label: "Animation",
      type: "select",
      clearable: true,
      placeholder: "Select animation",
      options: [
        {
          value: "bg-pan",
          label: "Pan",
          suffixText: "Update",
        },
        {
          value: "bg-fade",
          label: "Fade",
          suffixText: "Transition",
        },
      ],
    });
    expect(opacityField).toMatchObject({
      label: "Opacity",
      type: "slider-with-input",
      min: 0,
      max: 1,
      step: 0.01,
    });
    expect(blurField).toMatchObject({
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
    });
    expect(blurXField).toMatchObject({
      $when: "blur == true",
      label: "Blur X",
      type: "input-number",
    });
    expect(blurKernelSizeField).toMatchObject({
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
    });
    expect(continuityField).toBeUndefined();
    expect(viewData.dialogueForm.defaultValues.transformId).toBe("bg-center");
    expect(viewData.dialogueForm.defaultValues.opacity).toBe(1);
    expect(viewData.dialogueForm.defaultValues.blur).toBe(false);
    expect(viewData.dialogueForm.defaultValues.blurX).toBe(6);
    expect(viewData.dialogueForm.defaultValues.blurY).toBe(9);
    expect(viewData.dialogueForm.defaultValues.blurQuality).toBe(3);
    expect(viewData.dialogueForm.defaultValues.blurKernelSize).toBe(9);
    expect(viewData.dialogueForm.defaultValues.blurRepeatEdgePixels).toBe(true);
    expect(viewData.dialogueForm.defaultValues.animationId).toBeUndefined();
    expect(viewData.dialogueForm.defaultValues.playbackContinuity).toBe(
      "render",
    );
  });

  it("shows playback continuity when an animation is selected", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        images: {
          items: {
            "bg-school": {
              id: "bg-school",
              type: "image",
              name: "School",
              fileId: "file-school",
            },
          },
          tree: [{ id: "bg-school" }],
        },
        layouts: createEmptyCollection(),
        videos: createEmptyCollection(),
        animations: {
          items: {
            "bg-pan": {
              id: "bg-pan",
              type: "animation",
              name: "Pan",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "bg-pan" }],
        },
        transforms: {
          items: {
            "bg-center": {
              id: "bg-center",
              type: "transform",
              name: "Center",
            },
          },
          tree: [{ id: "bg-center" }],
        },
      },
    );
    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setSelectedTransform(
      { state },
      {
        transformId: "bg-center",
      },
    );
    setSelectedAnimation(
      { state },
      {
        animationId: "bg-pan",
      },
    );

    const viewData = selectViewData({ state });
    const animationField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "animationId",
    );
    const continuityField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "playbackContinuity",
    );

    expect(animationField).toMatchObject({
      type: "select",
      clearable: true,
      options: [
        {
          value: "bg-pan",
          label: "Pan",
          suffixText: "Update",
        },
      ],
    });
    expect(continuityField).toMatchObject({
      name: "playbackContinuity",
      label: "Playback",
      type: "segmented-control",
      options: [
        {
          label: "Single Line",
          value: "render",
        },
        {
          label: "Persistent",
          value: "persistent",
        },
      ],
    });
    expect(viewData.dialogueForm.defaultValues.transformId).toBe("bg-center");
    expect(viewData.dialogueForm.defaultValues.animationId).toBe("bg-pan");
    expect(viewData.dialogueForm.defaultValues.playbackContinuity).toBe(
      "render",
    );
  });

  it("uses a selected background opacity when provided", () => {
    const state = createInitialState();

    setSelectedOpacity(
      { state },
      {
        opacity: "0.45",
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.dialogueForm.defaultValues.opacity).toBe(0.45);
  });

  it("uses selected background blur values when enabled", () => {
    const state = createInitialState();

    setSelectedBlur(
      { state },
      {
        blur: {
          x: "8",
          y: 10,
          quality: 4,
          kernelSize: 11,
          repeatEdgePixels: false,
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.dialogueForm.defaultValues.blur).toBe(true);
    expect(viewData.dialogueForm.defaultValues.blurX).toBe(8);
    expect(viewData.dialogueForm.defaultValues.blurY).toBe(10);
    expect(viewData.dialogueForm.defaultValues.blurQuality).toBe(4);
    expect(viewData.dialogueForm.defaultValues.blurKernelSize).toBe(11);
    expect(viewData.dialogueForm.defaultValues.blurRepeatEdgePixels).toBe(
      false,
    );
  });

  it("normalizes invalid background blur kernel size to a supported option", () => {
    const state = createInitialState();

    setSelectedBlur(
      { state },
      {
        blur: {
          kernelSize: 12,
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.dialogueForm.defaultValues.blurKernelSize).toBe(11);
  });
});
