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
  setSelectedColor,
  setSelectedOpacity,
  setSelectedResource,
  setTempSelectedResource,
  setSelectedTransform,
  showAnimationOption,
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

const selectOptionFields = (viewData, optionId) => {
  const optionsSection = viewData.dialogueForm.form.fields.find(
    (field) => field.id === "options",
  );
  return optionsSection.fields.find((field) => field.id === optionId)?.fields;
};

describe("commandLineBackground.store", () => {
  it("keeps optional background fields hidden until they are added", () => {
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
                tween: {
                  x: {
                    keyframes: [{ duration: 300, value: 100 }],
                  },
                },
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
        colors: {
          items: {
            "color-night": {
              id: "color-night",
              type: "color",
              name: "Night",
              hex: "#112233",
            },
          },
          tree: [{ id: "color-night" }],
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
    const backgroundField = viewData.dialogueForm.form.fields.find(
      (field) => field.slot === "background",
    );
    const transformRow = viewData.dialogueForm.form.fields.find(
      (field) => field.type === "row",
    );
    const [transformModeField, transformField] = transformRow.fields;
    const animationField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "animationId",
    );
    const opacityField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "opacity",
    );
    const colorField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "colorId",
    );
    const blurField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "blur",
    );
    const continuityField = viewData.dialogueForm.form.fields.find(
      (field) => field.name === "playbackContinuity",
    );
    const optionsSection = viewData.dialogueForm.form.fields.at(-1);

    expect(backgroundField).toMatchObject({
      type: "slot",
      label: "Background",
    });
    expect(backgroundField.description).toBeUndefined();
    expect(transformModeField).toMatchObject({
      name: "customTransform",
      label: "Transform",
      type: "segmented-control",
    });
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
    expect(animationField).toBeUndefined();
    expect(opacityField).toBeUndefined();
    expect(colorField).toBeUndefined();
    expect(blurField).toBeUndefined();
    expect(continuityField).toBeUndefined();
    expect(optionsSection).toEqual({
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
    expect(viewData.dialogueForm.defaultValues.transformId).toBe("bg-center");
    expect(viewData.dialogueForm.defaultValues.opacity).toBe(1);
    expect(viewData.dialogueForm.defaultValues.colorId).toBeUndefined();
    expect(viewData.backgroundColorOptionVisible).toBe(false);
    expect(viewData.dialogueForm.defaultValues.blur).toBeUndefined();
    expect(viewData.dialogueForm.defaultValues.animationId).toBeUndefined();
    expect(viewData.dialogueForm.defaultValues.playbackContinuity).toBe(
      "render",
    );
  });

  it("shows playback controls for a selected update animation", () => {
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
                tween: {
                  x: {
                    keyframes: [{ duration: 300, value: 100 }],
                  },
                },
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
    const animationFields = selectOptionFields(viewData, "animation");
    const animationField = animationFields.find(
      (field) => field.name === "animationId",
    );
    const continuityField = animationFields.find(
      (field) => field.name === "playbackContinuity",
    );
    const speedField = animationFields.find(
      (field) => field.name === "playbackSpeed",
    );
    const loopField = animationFields.find(
      (field) => field.name === "playbackLoop",
    );

    expect(animationField).toMatchObject({
      type: "select",
      noClear: true,
      required: true,
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
      label: "Continuity",
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
    expect(speedField).toMatchObject({
      name: "playbackSpeed",
      label: "Playback Speed",
      type: "input-number",
      min: 0.01,
      step: 0.1,
      required: true,
    });
    expect(loopField).toMatchObject({
      name: "playbackLoop",
      label: "Loop",
      type: "segmented-control",
      clearable: false,
      options: [
        {
          value: false,
          label: "Don't Loop",
        },
        {
          value: true,
          label: "Loop",
        },
      ],
    });
    expect(
      animationFields
        .filter((field) => field.name?.startsWith("playback"))
        .map((field) => field.name),
    ).toEqual(["playbackSpeed", "playbackLoop", "playbackContinuity"]);
    expect(viewData.dialogueForm.defaultValues.transformId).toBe("bg-center");
    expect(viewData.dialogueForm.defaultValues.animationId).toBe("bg-pan");
    expect(viewData.dialogueForm.defaultValues.playbackContinuity).toBe(
      "render",
    );
    expect(viewData.dialogueForm.defaultValues.playbackSpeed).toBe(1);
    expect(viewData.dialogueForm.defaultValues.playbackLoop).toBe(false);
  });

  it("disables playback loop for automatic update animations", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        animations: {
          items: {
            "bg-auto": {
              id: "bg-auto",
              type: "animation",
              name: "Automatic Position",
              animation: {
                type: "update",
                tween: {
                  x: {
                    auto: {
                      duration: 300,
                      easing: "linear",
                    },
                  },
                },
              },
            },
          },
          tree: [{ id: "bg-auto" }],
        },
      },
    );
    setSelectedAnimation(
      { state },
      {
        animationId: "bg-auto",
      },
    );

    const loopField = selectOptionFields(
      selectViewData({ state }),
      "animation",
    ).find((field) => field.name === "playbackLoop");

    expect(loopField).toMatchObject({
      disabled: true,
      description: "loopingRequiresKeyframesDescription",
    });
  });

  it("hides playback loop for a selected transition animation", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        animations: {
          items: {
            "bg-fade": {
              id: "bg-fade",
              type: "animation",
              name: "Fade",
              animation: {
                type: "transition",
              },
            },
          },
          tree: [{ id: "bg-fade" }],
        },
      },
    );
    setSelectedAnimation(
      { state },
      {
        animationId: "bg-fade",
      },
    );

    const fields = selectOptionFields(selectViewData({ state }), "animation");

    expect(
      fields.find((field) => field.name === "playbackSpeed"),
    ).toBeDefined();
    expect(
      fields.find((field) => field.name === "playbackLoop"),
    ).toBeUndefined();
    expect(
      fields
        .filter((field) => field.name?.startsWith("playback"))
        .map((field) => field.name),
    ).toEqual(["playbackSpeed", "playbackContinuity"]);
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
    const transformRow = viewData.dialogueForm.form.fields.find(
      (field) => field.type === "row",
    );
    const transformField = transformRow.fields.find(
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
      { label: "Anchor", value: "0.5, 0.5" },
      { label: "Rotation", value: "0°" },
      { label: "Origin", value: "320, 180" },
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
    const optionsSection = viewData.dialogueForm.form.fields.at(-1);
    expect(optionsSection.fields).toContainEqual({
      type: "section",
      id: "opacity",
      label: "Opacity",
      action: {
        id: "remove",
        icon: "x",
        label: "Remove",
      },
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
  });

  it("shows a selected background color as an inline option select", () => {
    const state = createInitialState();
    setRepositoryState(
      { state },
      {
        colors: {
          items: {
            "color-night": {
              id: "color-night",
              type: "color",
              name: "Night",
              hex: "#112233",
            },
          },
          tree: [{ id: "color-night" }],
        },
      },
    );
    setSelectedColor({ state }, { colorId: "color-night" });

    const viewData = selectViewData({ state });
    const optionsSection = viewData.dialogueForm.form.fields.at(-1);

    expect(viewData.backgroundColorOptionVisible).toBe(true);
    const backgroundColorSection = optionsSection.fields.find(
      (field) => field.id === "background-color",
    );
    expect(backgroundColorSection).toMatchObject({
      type: "section",
      label: "Background Color",
      action: {
        id: "remove",
        icon: "x",
        label: "Remove",
      },
      fields: [
        {
          name: "colorId",
          type: "select",
          noClear: true,
          required: true,
          placeholder: "Select color",
          options: [
            {
              value: "color-night",
              label: "Night",
            },
          ],
        },
      ],
    });
    expect(viewData.dialogueForm.defaultValues.colorId).toBe("color-night");
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

    const optionsSection = viewData.dialogueForm.form.fields.at(-1);

    const blurSection = optionsSection.fields.find(
      (field) => field.id === "blur",
    );
    expect(optionsSection.action).toMatchObject({
      id: "add",
      icon: "plus",
    });
    expect(blurSection).toMatchObject({
      type: "section",
      id: "blur",
      label: "Blur",
      action: {
        id: "remove",
        icon: "x",
        label: "Remove",
      },
      fields: [
        {
          type: "row",
          fields: [
            { name: "blurX", label: "Blur X", type: "input-number" },
            { name: "blurY", label: "Blur Y", type: "input-number" },
          ],
        },
        {
          type: "row",
          fields: [
            {
              name: "blurQuality",
              label: "Quality",
              type: "input-number",
            },
            {
              name: "blurKernelSize",
              label: "Kernel Size",
              type: "select",
            },
          ],
        },
        {
          name: "blurRepeatEdgePixels",
          label: "Repeat Edge Pixels",
          type: "segmented-control",
        },
      ],
    });
    expect(viewData.dialogueForm.defaultValues).toMatchObject({
      blurX: 8,
      blurY: 10,
      blurQuality: 4,
      blurKernelSize: 11,
      blurRepeatEdgePixels: false,
    });
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

    const optionsSection = viewData.dialogueForm.form.fields.at(-1);
    expect(optionsSection.fields.some((field) => field.id === "blur")).toBe(
      false,
    );
    expect(selectSelectedBlurActionValue({ state })).toBeNull();
  });

  it("hides the options add action when every option is visible", () => {
    const state = createInitialState();

    setSelectedColor({ state }, { colorId: "color-night" });
    setSelectedOpacity({ state }, { opacity: 1 });
    setSelectedBlur({ state }, { blur: {} });
    showAnimationOption({ state });

    const viewData = selectViewData({ state });
    const optionsSection = viewData.dialogueForm.form.fields.at(-1);

    expect(optionsSection.action).toBeUndefined();
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
