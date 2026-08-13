import { describe, expect, it } from "vitest";
import {
  addVisual,
  clearPendingVisualConfig,
  clearPendingVisualLayer,
  clearPendingVisualTransformId,
  createInitialState,
  hideAddVisualPopover,
  moveVisual,
  openAddVisualPopover,
  removeVisualFlipOption,
  removeVisualShaderAdjustmentOption,
  selectDefaultVisualLayer,
  selectPendingVisualLayer,
  selectPendingVisualTransformId,
  selectSelectedVisuals,
  selectVisualFlipOptionEnabled,
  selectViewData as selectViewDataBase,
  setAnimations,
  setExistingVisuals,
  setImages,
  setLayouts,
  setPendingVisualLayer,
  setPendingVisualTransformId,
  setTab,
  setSpritesheets,
  setTempSelectedResourceId,
  setTransforms,
  setUiConfig,
  setVideos,
  showVisualFlipOption,
  showDropdownMenu,
  updateVisualAnimation,
  updateVisualBlurEnabled,
  updateVisualBlurField,
  updateVisualCustomTransform,
  updateVisualCustomTransformEnabled,
  updateVisualLayer,
  updateVisualOpacity,
  updateVisualResource,
  updateVisualShaderAdjustment,
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

describe("commandLineVisual mobile resource selector", () => {
  it("uses two resource columns and hides the explorer in touch mode", () => {
    const state = createInitialState();

    expect(selectViewData({ state })).toMatchObject({
      showResourceSelectorFileExplorer: true,
      resourceSelectorColumns: undefined,
      resourceSelectorGridStyle: "",
    });

    setUiConfig({ state }, { uiConfig: { inputMode: "touch" } });

    expect(selectViewData({ state })).toMatchObject({
      showResourceSelectorFileExplorer: false,
      resourceSelectorColumns: 2,
      resourceSelectorGridStyle:
        "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));",
    });
  });
});

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

  it("adds visuals with a required default layer and updates selected layers", () => {
    const state = createInitialState();
    setRepositoryCollections(state);

    addVisual(
      { state },
      {
        resourceId: "visual-image",
        resourceType: "image",
      },
    );

    expect(selectDefaultVisualLayer()).toBe(50);
    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      resourceId: "visual-image",
      resourceType: "image",
      layer: 50,
    });

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
    expect(viewData.defaultValues.blurToggleOptions).toEqual([
      { value: false, label: "No Blur" },
      { value: true, label: "Blur" },
    ]);
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

    updateVisualBlurEnabled({ state }, { index: 0, enabled: false });
    expect(selectSelectedVisuals({ state })[0].blur).toBeNull();

    updateVisualBlurEnabled({ state }, { index: 0, enabled: true });
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

  it("builds add visual popover form options and tracks pending values", () => {
    const state = createInitialState();
    setRepositoryCollections(state);

    openAddVisualPopover(
      { state },
      {
        position: { x: 24, y: 48 },
      },
    );

    let viewData = selectViewData({ state });

    expect(viewData.addVisualPopover).toMatchObject({
      isOpen: true,
      position: { x: 24, y: 48 },
    });
    expect(viewData.addVisualDefaultValues).toEqual({
      transformId: "visual-center",
      layer: 50,
    });
    expect(viewData.addVisualForm.fields).toEqual([
      {
        name: "transformId",
        type: "select",
        label: "Transform",
        options: [
          {
            label: "Center",
            value: "visual-center",
          },
        ],
        clearable: false,
        placeholder: "Select transform",
      },
      {
        name: "layer",
        type: "select",
        label: "Layer",
        options: [
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
        ],
        clearable: false,
      },
    ]);

    setPendingVisualTransformId(
      { state },
      {
        transformId: "visual-center",
      },
    );
    setPendingVisualLayer(
      { state },
      {
        layer: 70,
      },
    );
    expect(selectPendingVisualTransformId({ state })).toBe("visual-center");
    expect(selectPendingVisualLayer({ state })).toBe(70);

    viewData = selectViewData({ state });
    expect(viewData.addVisualDefaultValues).toEqual({
      transformId: "visual-center",
      layer: 70,
    });

    clearPendingVisualLayer({ state });
    expect(selectPendingVisualLayer({ state })).toBe(50);

    clearPendingVisualTransformId({ state });
    expect(selectPendingVisualTransformId({ state })).toBe("visual-center");

    setPendingVisualLayer(
      { state },
      {
        layer: 90,
      },
    );
    clearPendingVisualConfig({ state });
    expect(state.pendingVisualLayer).toBeUndefined();
    expect(state.pendingVisualTransformId).toBeUndefined();

    hideAddVisualPopover({ state });
    expect(selectViewData({ state }).addVisualPopover).toMatchObject({
      isOpen: false,
      position: { x: 0, y: 0 },
    });
  });

  it("adds visuals with the provided layer", () => {
    const state = createInitialState();
    setRepositoryCollections(state);

    addVisual(
      { state },
      {
        resourceId: "visual-image",
        resourceType: "image",
        layer: 10,
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      resourceId: "visual-image",
      resourceType: "image",
      layer: 10,
    });
  });

  it("adds visuals with the provided transform", () => {
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
            },
            "visual-left": {
              id: "visual-left",
              type: "transform",
              name: "Left",
            },
          },
          tree: [{ id: "visual-center" }, { id: "visual-left" }],
        },
      },
    );

    addVisual(
      { state },
      {
        resourceId: "visual-image",
        resourceType: "image",
        transformId: "visual-left",
        layer: 10,
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      resourceId: "visual-image",
      resourceType: "image",
      transformId: "visual-left",
      layer: 10,
    });
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
    expect(selectViewData({ state }).dropdownMenu.items).toEqual([
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
    expect(selectViewData({ state }).dropdownMenu.items).toEqual([
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
    expect(selectViewData({ state }).dropdownMenu.items).toEqual([
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
    expect(selectViewData({ state }).dropdownMenu.items).toEqual([
      { label: "Delete", type: "item", value: "delete" },
    ]);

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        visualIndex: 1,
      },
    );
    expect(selectViewData({ state }).dropdownMenu.items).toEqual([
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
    expect(selectViewData({ state }).dropdownMenu.items).toEqual([
      { label: "Move Down", type: "item", value: "move-down" },
      { label: "Delete", type: "item", value: "delete" },
    ]);
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

  it("exposes resource tabs and filters picker resources by active tab", () => {
    const state = createInitialState();
    setRepositoryCollections(state);

    let viewData = selectViewData({ state });
    expect(viewData.tab).toBe("image");
    expect(viewData.tabs).toEqual([
      { id: "image", label: "Images" },
      { id: "spritesheet", label: "Spritesheets" },
      { id: "video", label: "Videos" },
      { id: "layout", label: "Layouts" },
    ]);
    expect(
      viewData.resourceGroups.flatMap((group) =>
        group.children.map((child) => child.id),
      ),
    ).toEqual(["visual-image"]);

    setTab({ state }, { tab: "video" });
    viewData = selectViewData({ state });
    expect(viewData.tab).toBe("video");
    expect(
      viewData.resourceGroups.flatMap((group) =>
        group.children.map((child) => child.id),
      ),
    ).toEqual(["visual-video"]);

    setTab({ state }, { tab: "spritesheet" });
    setTempSelectedResourceId(
      { state },
      {
        resourceId: "visual-spritesheet",
        resourceType: "spritesheet",
        animationName: "idle",
      },
    );
    viewData = selectViewData({ state });
    expect(viewData.tab).toBe("spritesheet");
    expect(viewData.tempSelectedSpritesheetValue).toBe(
      "visual-spritesheet::idle",
    );

    setTab({ state }, { tab: "layout" });
    viewData = selectViewData({ state });
    expect(viewData.tab).toBe("layout");
    expect(
      viewData.resourceGroups.flatMap((group) =>
        group.children.map((child) => child.id),
      ),
    ).toEqual(["visual-layout"]);
  });

  it("hydrates spritesheet animation previews and preserves animation names", () => {
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

    updateVisualResource(
      { state },
      {
        index: 0,
        resourceId: "visual-image",
        resourceType: "image",
      },
    );
    expect(selectSelectedVisuals({ state })[0].animationName).toBeUndefined();
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
