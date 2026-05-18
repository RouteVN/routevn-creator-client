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
  selectDefaultVisualLayer,
  selectPendingVisualLayer,
  selectPendingVisualTransformId,
  selectSelectedVisuals,
  selectViewData,
  setAnimations,
  setExistingVisuals,
  setImages,
  setLayouts,
  setPendingVisualLayer,
  setPendingVisualTransformId,
  setTab,
  setTransforms,
  setVideos,
  showDropdownMenu,
  updateVisualAnimation,
  updateVisualBlurEnabled,
  updateVisualBlurField,
  updateVisualLayer,
  updateVisualOpacity,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";

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
        value: 10,
        label: "Behind Background",
      },
      {
        value: 30,
        label: "Behind Character",
      },
      {
        value: 50,
        label: "Behind Dialogue",
      },
      {
        value: 70,
        label: "Foreground",
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
    expect(selectSelectedVisuals({ state })[0].blur).toBeUndefined();

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
            value: 10,
            label: "Behind Background",
          },
          {
            value: 30,
            label: "Behind Character",
          },
          {
            value: 50,
            label: "Behind Dialogue",
          },
          {
            value: 70,
            label: "Foreground",
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
        layer: 70,
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
            layer: 70,
          },
        ],
      },
    );

    let viewData = selectViewData({ state });

    expect(selectSelectedVisuals({ state }).map((visual) => visual.id)).toEqual(
      ["visual-2", "visual-4", "visual-1", "visual-3"],
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
        index: 3,
        layer: 70,
      },
    );
    viewData = selectViewData({ state });

    expect(selectSelectedVisuals({ state }).map((visual) => visual.id)).toEqual(
      ["visual-2", "visual-4", "visual-3", "visual-1"],
    );
    expect(viewData.defaultValues.visualGroups[0]).toMatchObject({
      label: "Foreground",
      layer: 70,
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
          { id: "visual-2", resourceId: "visual-video", layer: 70 },
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

    setTab({ state }, { tab: "layout" });
    viewData = selectViewData({ state });
    expect(viewData.tab).toBe("layout");
    expect(
      viewData.resourceGroups.flatMap((group) =>
        group.children.map((child) => child.id),
      ),
    ).toEqual(["visual-layout"]);
  });
});
