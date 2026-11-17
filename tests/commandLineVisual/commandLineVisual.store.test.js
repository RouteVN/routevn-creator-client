import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addVisual,
  createInitialState,
  moveVisual,
  removeVisualBlurOption,
  removeVisualFlipOption,
  removeVisualOpacityOption,
  removeVisualShaderAdjustmentOption,
  selectSelectedVisuals,
  selectVisualBlurOptionEnabled,
  selectVisualFlipOptionEnabled,
  selectViewData as selectViewDataBase,
  setAnimations,
  setExistingVisuals,
  setImages,
  setLayouts,
  setParticles,
  setResolution,
  setSpritesheets,
  setTransforms,
  setVideos,
  showVisualBlurOption,
  showVisualFlipOption,
  showVisualOpacityOption,
  showDropdownMenu,
  startVisualEdit,
  updateVisualAnimation,
  updateVisualBlurField,
  updateVisualCustomTransform,
  updateVisualCustomTransformEnabled,
  updateVisualLayer,
  updateVisualOpacity,
  updateVisualShaderAdjustment,
  updateVisualTransform,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";
import { COMMAND_LINE_SHADER_ADJUSTMENTS } from "../../src/internal/commandLineShaderAdjustments.js";

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

const setRepositoryCollections = (state) => {
  setImages(
    { state },
    {
      images: {
        items: {
          "visual-image": {
            id: "visual-image",
            type: "image",
            name: "Spotlight",
            fileId: "file-spotlight",
          },
        },
        tree: [{ id: "visual-image" }],
      },
    },
  );
  setVideos(
    { state },
    {
      videos: {
        items: {
          "visual-video": {
            id: "visual-video",
            type: "video",
            name: "Intro Video",
            fileId: "file-intro-video",
            thumbnailFileId: "file-intro-thumbnail",
          },
        },
        tree: [{ id: "visual-video" }],
      },
    },
  );
  setSpritesheets(
    { state },
    {
      spritesheets: {
        items: {
          "visual-spritesheet": {
            id: "visual-spritesheet",
            type: "spritesheet",
            name: "Hero",
            fileId: "file-hero-spritesheet",
            jsonData: {
              frames: {
                "idle-0": {
                  frame: { x: 0, y: 0, w: 64, h: 64 },
                },
              },
            },
            animations: {
              idle: {
                frames: ["idle-0"],
                fps: 12,
              },
            },
          },
        },
        tree: [{ id: "visual-spritesheet" }],
      },
    },
  );
  setLayouts(
    { state },
    {
      layouts: {
        items: {
          "visual-layout": {
            id: "visual-layout",
            type: "layout",
            layoutType: "general",
            name: "Poster Layout",
            thumbnailFileId: "file-poster-layout",
          },
          "dialogue-layout": {
            id: "dialogue-layout",
            type: "layout",
            layoutType: "dialogue-adv",
            name: "Dialogue Layout",
            thumbnailFileId: "file-dialogue-layout",
          },
        },
        tree: [{ id: "visual-layout" }, { id: "dialogue-layout" }],
      },
    },
  );
  setParticles(
    { state },
    {
      particles: {
        items: {
          "visual-particle": {
            id: "visual-particle",
            type: "particle",
            name: "Snowfall",
            width: 1920,
            height: 1080,
            thumbnailFileId: "file-snowfall-thumbnail",
            modules: {},
          },
        },
        tree: [{ id: "visual-particle" }],
      },
    },
  );
  setTransforms(
    { state },
    {
      transforms: {
        items: {
          "visual-center": {
            id: "visual-center",
            type: "transform",
            name: "Center",
          },
        },
        tree: [{ id: "visual-center" }],
      },
    },
  );
  setAnimations(
    { state },
    {
      animations: {
        items: {
          "visual-fade": {
            id: "visual-fade",
            type: "animation",
            name: "Fade",
            animation: {
              type: "update",
            },
          },
          "visual-wipe": {
            id: "visual-wipe",
            type: "animation",
            name: "Wipe",
            animation: {
              type: "transition",
            },
          },
        },
        tree: [{ id: "visual-fade" }, { id: "visual-wipe" }],
      },
    },
  );
};

const menuItemsWithoutMoveLayer = (state) =>
  selectViewData({ state }).dropdownMenu.items.filter(
    (item) => item.value !== "move-layer",
  );

describe("commandLineVisual.store animation controls", () => {
  it("exposes animation controls for each selected visual", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            animations: {
              resourceId: "visual-wipe",
            },
          },
        ],
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.defaultValues.visuals[0]).toMatchObject({
      id: "visual-1",
      resourceId: "visual-image",
      resourceType: "image",
      transformId: "visual-center",
      layer: 50,
      animationMode: "transition",
      animationId: "visual-wipe",
    });
    expect(viewData.defaultValues.layerOptions).toEqual([
      {
        value: 90,
        label: "Foreground",
      },
      {
        value: 70,
        label: "Behind Choice",
      },
      {
        value: 50,
        label: "Behind Dialogue",
      },
      {
        value: 30,
        label: "Behind Character",
      },
      {
        value: 10,
        label: "Behind Background",
      },
    ]);
    expect(viewData.defaultValues.animationOptions).toEqual([
      {
        value: "visual-fade",
        label: "Fade",
        suffixText: "Update",
      },
      {
        value: "visual-wipe",
        label: "Wipe",
        suffixText: "Transition",
      },
    ]);
  });

  it("updates and clears visual animation selections", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            animations: {
              resourceId: "visual-wipe",
            },
          },
        ],
      },
    );

    updateVisualAnimation(
      { state },
      {
        index: 0,
        animationId: "visual-wipe",
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      animationMode: "transition",
      animations: {
        resourceId: "visual-wipe",
      },
    });

    updateVisualAnimation(
      { state },
      {
        index: 0,
        animationId: undefined,
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      animationMode: "none",
    });
    expect(selectSelectedVisuals({ state })[0].animations).toBeUndefined();
  });

  it("handles empty animation collections", () => {
    const state = createInitialState();
    setAnimations({ state }, { animations: createEmptyCollection() });

    const viewData = selectViewData({ state });

    expect(viewData.defaultValues.animationOptions).toEqual([]);
  });

  it("adds a visual as an empty layout on the screen, in the default layer", () => {
    const state = createInitialState();
    setRepositoryCollections(state);

    addVisual({ state }, { id: "visual-new" });

    expect(selectSelectedVisuals({ state })).toEqual([
      {
        id: "visual-new",
        layout: {
          layoutSchemaVersion: 2,
          elements: { items: {}, tree: [] },
        },
        layer: 50,
        animationMode: "none",
      },
    ]);

    updateVisualLayer(
      { state },
      {
        index: 0,
        layer: 30,
      },
    );

    expect(selectSelectedVisuals({ state })[0].layer).toBe(30);

    updateVisualLayer(
      { state },
      {
        index: 0,
        layer: 20,
      },
    );

    expect(selectSelectedVisuals({ state })[0].layer).toBe(50);
  });

  it("normalizes visual opacity and blur controls", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            opacity: "0.75",
            blur: {
              x: "8",
              y: "10",
              quality: "4",
              kernelSize: 12,
              repeatEdgePixels: "false",
            },
          },
        ],
      },
    );

    let selectedVisual = selectSelectedVisuals({ state })[0];
    expect(selectedVisual.opacity).toBe(0.75);
    expect(selectedVisual.blur).toEqual({
      x: 8,
      y: 10,
      quality: 4,
      kernelSize: 11,
      repeatEdgePixels: false,
    });

    let viewData = selectViewData({ state });
    expect(viewData.defaultValues.visuals[0]).toMatchObject({
      opacityEnabled: true,
      opacity: 0.75,
      blurEnabled: true,
      blur: {
        x: 8,
        y: 10,
        quality: 4,
        kernelSize: 11,
        repeatEdgePixels: false,
      },
    });
    expect(viewData.defaultValues.blurKernelSizeOptions).toEqual([
      { value: 5, label: "5" },
      { value: 7, label: "7" },
      { value: 9, label: "9" },
      { value: 11, label: "11" },
      { value: 13, label: "13" },
      { value: 15, label: "15" },
    ]);

    updateVisualOpacity({ state }, { index: 0, opacity: "1.2" });
    expect(selectSelectedVisuals({ state })[0].opacity).toBe(1);

    removeVisualBlurOption({ state }, { index: 0 });
    expect(selectSelectedVisuals({ state })[0].blur).toBeNull();
    expect(selectVisualBlurOptionEnabled({ state }, { index: 0 })).toBe(false);

    showVisualBlurOption({ state }, { index: 0 });
    updateVisualBlurField(
      { state },
      {
        index: 0,
        fieldName: "kernelSize",
        value: 14,
      },
    );
    selectedVisual = selectSelectedVisuals({ state })[0];
    expect(selectedVisual.blur).toMatchObject({
      x: 6,
      y: 9,
      quality: 3,
      kernelSize: 13,
      repeatEdgePixels: true,
    });

    viewData = selectViewData({ state });
    expect(viewData.defaultValues.visuals[0]).toMatchObject({
      opacityEnabled: true,
      opacity: 1,
      blurEnabled: true,
      blur: selectedVisual.blur,
    });
  });

  it("manages header-only flip options for each visual", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
          },
        ],
      },
    );

    showVisualFlipOption({ state }, { index: 0, optionId: "flip-x" });
    showVisualFlipOption({ state }, { index: 0, optionId: "flip-y" });

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      flipX: true,
      flipY: true,
    });
    expect(
      selectVisualFlipOptionEnabled(
        { state },
        { index: 0, optionId: "flip-x" },
      ),
    ).toBe(true);

    startVisualEdit({ state }, { index: 0 });
    const viewData = selectViewData({ state });
    const flipSections = viewData.form.fields[0].fields.filter((field) =>
      ["visual-0-flip-x", "visual-0-flip-y"].includes(field.id),
    );
    expect(flipSections).toEqual([
      expect.objectContaining({
        id: "visual-0-flip-x",
        label: "Flip X",
        action: expect.objectContaining({ id: "remove" }),
        fields: [],
      }),
      expect.objectContaining({
        id: "visual-0-flip-y",
        label: "Flip Y",
        action: expect.objectContaining({ id: "remove" }),
        fields: [],
      }),
    ]);

    removeVisualFlipOption({ state }, { index: 0, optionId: "flip-x" });
    expect(selectSelectedVisuals({ state })[0].flipX).toBe(false);
    expect(selectSelectedVisuals({ state })[0].flipY).toBe(true);
    expect(
      selectVisualFlipOptionEnabled(
        { state },
        { index: 0, optionId: "flip-x" },
      ),
    ).toBe(false);
  });

  it("hides the visual add action only when every offered option is enabled", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
          },
        ],
      },
    );

    showVisualOpacityOption({ state }, { index: 0 });
    showVisualBlurOption({ state }, { index: 0 });
    showVisualFlipOption({ state }, { index: 0, optionId: "flip-x" });
    showVisualFlipOption({ state }, { index: 0, optionId: "flip-y" });
    for (const adjustment of COMMAND_LINE_SHADER_ADJUSTMENTS) {
      updateVisualShaderAdjustment(
        { state },
        {
          index: 0,
          adjustmentId: adjustment.id,
          value: adjustment.defaultValue,
        },
      );
    }

    startVisualEdit({ state }, { index: 0 });
    const viewData = selectViewData({ state });
    expect(viewData.form.fields[0].action).toBeUndefined();
    expect(viewData.defaultValues.visuals[0].opacityEnabled).toBe(true);
    expect(viewData.defaultValues.visuals[0].blurEnabled).toBe(true);

    removeVisualOpacityOption({ state }, { index: 0 });
    expect(selectViewData({ state }).form.fields[0].action).toMatchObject({
      id: "add",
    });
  });

  it("manages canonically ordered shader adjustments for each visual", () => {
    const state = createInitialState();
    const customFilter = {
      id: "customFilter",
      type: "shader",
      parameters: { strength: 0.5 },
      source: {},
    };
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            filters: [customFilter],
          },
        ],
      },
    );

    for (const adjustment of [...COMMAND_LINE_SHADER_ADJUSTMENTS].reverse()) {
      updateVisualShaderAdjustment(
        { state },
        {
          index: 0,
          adjustmentId: adjustment.id,
          value: adjustment.defaultValue,
        },
      );
    }

    const visual = selectSelectedVisuals({ state })[0];
    expect(visual.filters.map((filter) => filter.id)).toEqual([
      customFilter.id,
      ...COMMAND_LINE_SHADER_ADJUSTMENTS.map(
        (adjustment) => adjustment.filterId,
      ),
    ]);
    expect(visual.filters[1].source.webgl.fragment).toContain("uBrightness");
    expect(visual.filters[1].source.webgpu.source).toContain(
      "shaderUniforms.uBrightness",
    );

    startVisualEdit({ state }, { index: 0 });
    let viewData = selectViewData({ state });
    expect(
      viewData.defaultValues.visuals[0].shaderAdjustments.every(
        (adjustment) => adjustment.enabled,
      ),
    ).toBe(true);
    expect(
      viewData.form.fields[0].fields
        .filter((field) => field.type === "section")
        .map((field) => field.id),
    ).toEqual(
      COMMAND_LINE_SHADER_ADJUSTMENTS.map(
        (adjustment) => `visual-0-${adjustment.id}`,
      ),
    );
    expect(viewData.form.fields[0].action).toMatchObject({ id: "add" });

    removeVisualShaderAdjustmentOption(
      { state },
      { index: 0, adjustmentId: "saturation" },
    );
    viewData = selectViewData({ state });
    expect(
      viewData.defaultValues.visuals[0].shaderAdjustments.find(
        (adjustment) => adjustment.id === "saturation",
      ).enabled,
    ).toBe(false);
    expect(viewData.form.fields[0].action).toMatchObject({ id: "add" });
    expect(visual.filters.map((filter) => filter.id)).not.toContain(
      "backgroundSaturation",
    );
  });

  it("groups visible visuals by layer with higher layers first", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            layer: 50,
          },
          {
            id: "visual-2",
            resourceId: "visual-video",
            resourceType: "video",
            layer: 90,
          },
          {
            id: "visual-5",
            resourceId: "visual-video",
            resourceType: "video",
            layer: 70,
          },
          {
            id: "visual-3",
            resourceId: "visual-layout",
            resourceType: "layout",
            layer: 30,
          },
          {
            id: "visual-4",
            resourceId: "visual-image",
            resourceType: "image",
            layer: 90,
          },
        ],
      },
    );

    let viewData = selectViewData({ state });

    expect(selectSelectedVisuals({ state }).map((visual) => visual.id)).toEqual(
      ["visual-2", "visual-4", "visual-5", "visual-1", "visual-3"],
    );
    expect(
      viewData.defaultValues.visualGroups.map((group) => ({
        label: group.label,
        visualIds: group.visuals.map((visual) => visual.id),
      })),
    ).toEqual([
      {
        label: "Foreground",
        visualIds: ["visual-4", "visual-2"],
      },
      {
        label: "Behind Choice",
        visualIds: ["visual-5"],
      },
      {
        label: "Behind Dialogue",
        visualIds: ["visual-1"],
      },
      {
        label: "Behind Character",
        visualIds: ["visual-3"],
      },
    ]);

    updateVisualLayer(
      { state },
      {
        index: 4,
        layer: 90,
      },
    );
    viewData = selectViewData({ state });

    expect(selectSelectedVisuals({ state }).map((visual) => visual.id)).toEqual(
      ["visual-2", "visual-4", "visual-3", "visual-5", "visual-1"],
    );
    expect(viewData.defaultValues.visualGroups[0]).toMatchObject({
      label: "Foreground",
      layer: 90,
    });
    expect(
      viewData.defaultValues.visualGroups[0].visuals.map((visual) => visual.id),
    ).toEqual(["visual-3", "visual-4", "visual-2"]);
  });

  it("builds visual context menu move actions only when available", () => {
    const state = createInitialState();
    setExistingVisuals(
      { state },
      {
        visuals: [
          { id: "visual-1", resourceId: "visual-image" },
          { id: "visual-2", resourceId: "visual-video" },
          { id: "visual-3", resourceId: "visual-layout" },
        ],
      },
    );

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        visualIndex: 0,
      },
    );
    expect(menuItemsWithoutMoveLayer(state)).toEqual([
      { label: "Move Up", type: "item", value: "move-up" },
      { label: "Delete", type: "item", value: "delete" },
    ]);

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        visualIndex: 1,
      },
    );
    expect(menuItemsWithoutMoveLayer(state)).toEqual([
      { label: "Move Up", type: "item", value: "move-up" },
      { label: "Move Down", type: "item", value: "move-down" },
      { label: "Delete", type: "item", value: "delete" },
    ]);

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        visualIndex: 2,
      },
    );
    expect(menuItemsWithoutMoveLayer(state)).toEqual([
      { label: "Move Down", type: "item", value: "move-down" },
      { label: "Delete", type: "item", value: "delete" },
    ]);
  });

  it("limits context menu move actions to the current layer group", () => {
    const state = createInitialState();
    setExistingVisuals(
      { state },
      {
        visuals: [
          { id: "visual-1", resourceId: "visual-image", layer: 50 },
          { id: "visual-2", resourceId: "visual-video", layer: 90 },
          { id: "visual-3", resourceId: "visual-layout", layer: 50 },
        ],
      },
    );

    expect(selectSelectedVisuals({ state }).map((visual) => visual.id)).toEqual(
      ["visual-2", "visual-1", "visual-3"],
    );

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        visualIndex: 0,
      },
    );
    expect(menuItemsWithoutMoveLayer(state)).toEqual([
      { label: "Delete", type: "item", value: "delete" },
    ]);

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        visualIndex: 1,
      },
    );
    expect(menuItemsWithoutMoveLayer(state)).toEqual([
      { label: "Move Up", type: "item", value: "move-up" },
      { label: "Delete", type: "item", value: "delete" },
    ]);

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        visualIndex: 2,
      },
    );
    expect(menuItemsWithoutMoveLayer(state)).toEqual([
      { label: "Move Down", type: "item", value: "move-down" },
      { label: "Delete", type: "item", value: "delete" },
    ]);
  });

  it("offers Move Layer with every layer, the visual's own one disabled", () => {
    const state = createInitialState();
    setExistingVisuals(
      { state },
      {
        visuals: [
          { id: "visual-1", resourceId: "visual-image", layer: 50 },
          { id: "visual-2", resourceId: "visual-video", layer: 90 },
        ],
      },
    );
    const index = selectSelectedVisuals({ state }).findIndex(
      (visual) => visual.id === "visual-1",
    );

    showDropdownMenu(
      { state },
      { position: { x: 10, y: 20 }, visualIndex: index },
    );

    const { items } = selectViewData({ state }).dropdownMenu;
    expect(items.map((item) => item.value)).toEqual(["move-layer", "delete"]);
    const layers = items[0].items;
    expect(items[0].label).toBe("Move Layer");
    expect(layers.map((item) => item.layer)).toEqual(
      layers.map((item) => item.layer).sort((a, b) => b - a),
    );
    expect(layers.every((item) => item.value === "move-to-layer")).toBe(true);
    expect(layers.filter((item) => item.disabled)).toEqual([
      {
        label: "Behind Dialogue",
        type: "item",
        value: "move-to-layer",
        layer: 50,
        disabled: true,
      },
    ]);
    expect(layers.length).toBeGreaterThan(3);
  });

  it("moves selected visuals up and down", () => {
    const state = createInitialState();
    setExistingVisuals(
      { state },
      {
        visuals: [
          { id: "visual-1", resourceId: "visual-image" },
          { id: "visual-2", resourceId: "visual-video" },
          { id: "visual-3", resourceId: "visual-layout" },
        ],
      },
    );

    moveVisual({ state }, { index: 0, offset: 1 });
    expect(selectSelectedVisuals({ state }).map((visual) => visual.id)).toEqual(
      ["visual-2", "visual-1", "visual-3"],
    );

    moveVisual({ state }, { index: 1, offset: -1 });
    expect(selectSelectedVisuals({ state }).map((visual) => visual.id)).toEqual(
      ["visual-1", "visual-2", "visual-3"],
    );
  });

  it("resolves selected visual previews for videos and layouts", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-video-item",
            resourceId: "visual-video",
            resourceType: "video",
          },
          {
            id: "visual-layout-item",
            resourceId: "visual-layout",
            resourceType: "layout",
          },
        ],
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.defaultValues.visuals[0]).toMatchObject({
      id: "visual-layout-item",
      resourceId: "visual-layout",
      resourceType: "layout",
      displayName: "Poster Layout",
      fileId: "file-poster-layout",
      visualIndex: 1,
    });
    expect(viewData.defaultValues.visuals[1]).toMatchObject({
      id: "visual-video-item",
      resourceId: "visual-video",
      resourceType: "video",
      displayName: "Intro Video",
      fileId: "file-intro-thumbnail",
      visualIndex: 0,
    });
  });

  it("resolves selected particle visuals with or without a saved resource type", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-snow",
            resourceId: "visual-particle",
          },
        ],
      },
    );

    expect(selectSelectedVisuals({ state })[0].resourceType).toBe("particle");
    expect(selectViewData({ state }).defaultValues.visuals[0]).toMatchObject({
      id: "visual-snow",
      resourceId: "visual-particle",
      resourceType: "particle",
      displayName: "Snowfall",
      fileId: "file-snowfall-thumbnail",
    });
  });

  it("hydrates spritesheet animation previews with their animation names", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-hero-idle",
            resourceId: "visual-spritesheet",
            resourceType: "spritesheet",
            animationName: "idle",
          },
        ],
      },
    );

    const viewData = selectViewData({ state });
    expect(viewData.defaultValues.visuals[0]).toMatchObject({
      resourceId: "visual-spritesheet",
      resourceType: "spritesheet",
      animationName: "idle",
      displayName: "Hero / idle",
      spritesheetFileId: "file-hero-spritesheet",
      spritesheetAnimation: {
        frames: ["idle-0"],
        fps: 12,
      },
    });
  });
});

describe("commandLineVisual.store custom transforms", () => {
  it("copies the selected predefined transform into visual custom transform fields", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setTransforms(
      { state },
      {
        transforms: {
          items: {
            "visual-center": {
              id: "visual-center",
              type: "transform",
              name: "Center",
              x: 960,
              y: 540,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              anchorX: 0.5,
              anchorY: 0.5,
              originX: 100,
              originY: 80,
            },
          },
          tree: [{ id: "visual-center" }],
        },
      },
    );
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
          },
        ],
      },
    );

    updateVisualCustomTransformEnabled(
      { state },
      {
        index: 0,
        enabled: true,
      },
    );
    updateVisualCustomTransform(
      { state },
      {
        index: 0,
        transform: {
          x: 1000,
          y: 600,
          scaleX: 1.5,
          scaleY: 1.5,
          rotation: 10,
          anchorX: 0.5,
          anchorY: 0.5,
          originX: 100,
          originY: 80,
        },
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      transformId: "visual-center",
      x: 1000,
      y: 600,
      scaleX: 1.5,
      scaleY: 1.5,
      rotation: 10,
    });
    expect(selectViewData({ state }).defaultValues.visuals[0]).toMatchObject({
      customTransform: true,
      customTransformDetails: expect.arrayContaining([
        { label: "Position", value: "1000, 600" },
        { label: "Scale", value: "1.5 x 1.5" },
        { label: "Anchor", value: "0.5, 0.5" },
        { label: "Rotation", value: "10°" },
        { label: "Origin", value: "100, 80" },
      ]),
    });
  });
});

describe("commandLineVisual transform of a visual without one", () => {
  const createState = () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setTransforms(
      { state },
      {
        transforms: {
          items: {
            "bottom-left": {
              id: "bottom-left",
              type: "transform",
              name: "Bottom Left",
              x: 300,
              y: 720,
              anchorX: 0.5,
              anchorY: 1,
            },
          },
          tree: [{ id: "bottom-left" }],
        },
      },
    );
    setResolution({ state }, { resolution: { width: 1280, height: 720 } });
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            layer: 50,
            layout: {
              layoutSchemaVersion: 2,
              elements: { items: {}, tree: [] },
            },
          },
        ],
      },
    );
    return state;
  };

  const placementOf = (visual) => {
    const placement = {};
    for (const field of [
      "transformId",
      "x",
      "y",
      "anchorX",
      "anchorY",
      "scaleX",
      "scaleY",
      "rotation",
    ]) {
      if (visual[field] !== undefined) {
        placement[field] = visual[field];
      }
    }
    return placement;
  };

  it("is centered on the screen, not given the first transform", () => {
    const state = createState();
    const viewData = selectViewData({ state });

    expect(viewData.defaultValues.visuals[0].transformId).toBeUndefined();
    expect(viewData.defaultValues.visuals[0].customTransform).toBe(false);
    expect(viewData.selectTransformPlaceholder).toBe("Select transform");
    expect(viewData.visualListItems[0].details).toContainEqual({
      label: "Transform",
      value: "Screen Center",
    });
  });

  it("starts a custom transform at the center of the project's screen", () => {
    const state = createState();

    updateVisualCustomTransformEnabled({ state }, { index: 0, enabled: true });

    expect(placementOf(selectSelectedVisuals({ state })[0])).toEqual({
      x: 640,
      y: 360,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });

    // Back to Predefined: centered again, with no transform picked for it.
    updateVisualCustomTransformEnabled({ state }, { index: 0, enabled: false });
    expect(placementOf(selectSelectedVisuals({ state })[0])).toEqual({});
  });

  it("starts a custom transform from a picked transform, and is centered again when the pick is cleared", () => {
    const state = createState();

    updateVisualTransform({ state }, { index: 0, transform: "bottom-left" });
    updateVisualCustomTransformEnabled({ state }, { index: 0, enabled: true });
    expect(placementOf(selectSelectedVisuals({ state })[0])).toMatchObject({
      transformId: "bottom-left",
      x: 300,
      y: 720,
      anchorY: 1,
    });

    updateVisualCustomTransformEnabled({ state }, { index: 0, enabled: false });
    updateVisualTransform({ state }, { index: 0, transform: undefined });
    expect(placementOf(selectSelectedVisuals({ state })[0])).toEqual({});
    expect(selectViewData({ state }).visualListItems[0].details).toContainEqual(
      { label: "Transform", value: "Screen Center" },
    );
  });

  it("lets the predefined transform be cleared, showing the screen center when none is picked", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineVisual/commandLineVisual.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const select = view
      .split("\n")
      .find((line) =>
        line.includes("rtgl-select#transform${visual.controlId}"),
      );

    expect(select).toContain("placeholder=${selectTransformPlaceholder}");
    expect(select).not.toContain("no-clear");
  });
});
