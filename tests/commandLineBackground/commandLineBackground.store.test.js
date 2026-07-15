import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectSelectedResource,
  selectSelectedBlurActionValue,
  selectTempSelectedResource,
  selectViewData as selectViewDataBase,
  setRepositoryState,
  setCustomTransform,
  setCustomTransformEnabled,
  setSelectedAnimation,
  setSelectedBlur,
  setSelectedOpacity,
  setSelectedResource,
  setTempSelectedResource,
  setSelectedTransform,
} from "../../src/components/commandLineBackground/commandLineBackground.store.js";

const TEST_I18N = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

const selectViewData = (deps) =>
  selectViewDataBase({ ...deps, i18n: TEST_I18N });

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
      label: "Predefined Transform",
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

  it("shows the custom transform slot when custom transform is enabled", () => {
    const state = createInitialState();

    setSelectedResource(
      { state },
      {
        resourceId: "bg-school",
        resourceType: "image",
      },
    );
    setCustomTransformEnabled(
      { state },
      {
        enabled: true,
      },
    );
    setCustomTransform(
      { state },
      {
        transform: {
          x: 100,
          y: 120,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1.2,
          scaleY: 1.2,
          rotation: 0,
          originX: 320,
          originY: 180,
        },
      },
    );

    const viewData = selectViewData({ state });
    const transformField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "transformId",
    );
    const customTransformSlot = viewData.dialogueForm.form.fields.find(
      (field) => field.slot === "custom-transform",
    );

    expect(viewData.dialogueForm.defaultValues.customTransform).toBe(true);
    expect(transformField).toMatchObject({
      $when: "customTransform == false",
    });
    expect(customTransformSlot).toMatchObject({
      $when: "customTransform == true",
      type: "slot",
    });
    expect(viewData.customTransformDetails).toEqual([
      { label: "Position", value: "100, 120" },
      { label: "Scale", value: "1.2 x 1.2" },
    ]);
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

  it("keeps background blur null as an explicit clear value", () => {
    const state = createInitialState();

    setSelectedBlur(
      { state },
      {
        blur: null,
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.dialogueForm.defaultValues.blur).toBe(false);
    expect(selectSelectedBlurActionValue({ state })).toBeNull();
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

  it("passes background transform editor view data through to the nested preview", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      state,
      props: {
        backgroundTransformEditor: {
          isOpen: true,
          canvasAspectRatio: "4 / 3",
          previewMaxWidth: "640px",
          metrics: {
            x: "10.00",
            y: "20.00",
            scaleX: "1.20",
            scaleY: "1.20",
            rotation: "8.00",
          },
        },
      },
    });

    expect(viewData.backgroundTransformEditor).toEqual({
      isOpen: true,
      canvasAspectRatio: "4 / 3",
      previewMaxWidth: "640px",
      metrics: {
        x: "10.00",
        y: "20.00",
        scaleX: "1.20",
        scaleY: "1.20",
        rotation: "8.00",
      },
    });
  });

  it("selects a spritesheet animation and exposes its animated preview", () => {
    const state = createInitialState();
    const spritesheets = {
      items: {
        "bg-spritesheet": {
          id: "bg-spritesheet",
          type: "spritesheet",
          name: "Forest",
          fileId: "file-forest-spritesheet",
          jsonData: {
            frames: {
              "wind-0": {
                frame: { x: 0, y: 0, w: 128, h: 72 },
              },
            },
          },
          animations: {
            wind: {
              frames: ["wind-0"],
              fps: 10,
            },
          },
        },
      },
      tree: [{ id: "bg-spritesheet" }],
    };

    setRepositoryState(
      { state },
      {
        images: createEmptyCollection(),
        spritesheets,
        layouts: createEmptyCollection(),
        videos: createEmptyCollection(),
        animations: createEmptyCollection(),
        transforms: createEmptyCollection(),
        colors: createEmptyCollection(),
      },
    );
    setSelectedResource(
      { state },
      {
        resourceId: "bg-spritesheet",
        resourceType: "spritesheet",
        animationName: "wind",
      },
    );
    setTempSelectedResource(
      { state },
      {
        resourceId: "bg-spritesheet",
        resourceType: "spritesheet",
        animationName: "wind",
      },
    );

    expect(selectSelectedResource({ state })).toMatchObject({
      resourceId: "bg-spritesheet",
      resourceType: "spritesheet",
      animationName: "wind",
      name: "Forest / wind",
      fileId: "file-forest-spritesheet",
      spritesheetAnimation: {
        frames: ["wind-0"],
        fps: 10,
      },
    });
    expect(selectTempSelectedResource({ state })).toMatchObject({
      animationName: "wind",
    });

    const viewData = selectViewData({ state });
    expect(viewData.tabs).toContainEqual({
      id: "spritesheet",
      label: "Spritesheets",
    });
    expect(viewData.tempSelectedSpritesheetValue).toBe("bg-spritesheet::wind");
  });
});
