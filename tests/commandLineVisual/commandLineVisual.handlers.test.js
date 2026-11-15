import { describe, expect, it, vi } from "vitest";
import {
  handleAnimationChange,
  handleBlurFieldChange,
  handleBlurFieldInput,
  handleCustomTransformButtonClick,
  handleCustomTransformButtonKeyDown,
  handleDropdownMenuClickItem,
  handleFormSectionAction,
  handleLayerChange,
  handleOpacityInput,
  handleShaderAdjustmentInput,
  handleSubmitClick,
} from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";
import {
  createInitialState,
  hideDropdownMenu,
  moveVisual,
  removeVisual,
  removeVisualBlurOption,
  removeVisualFlipOption,
  removeVisualOpacityOption,
  removeVisualShaderAdjustmentOption,
  selectDropdownMenuType,
  selectDropdownMenuVisualIndex,
  selectMode,
  selectLayoutVisualItem,
  selectSelectedVisuals,
  selectSelectedVisualIndex,
  selectVisualBlurOptionEnabled,
  selectVisualFlipOptionEnabled,
  selectVisualMedia,
  selectVisualOpacityOptionEnabled,
  selectVisualShaderAdjustmentOptionEnabled,
  setAnimations,
  setExistingVisuals,
  showDropdownMenu,
  showVisualBlurOption,
  showVisualFlipOption,
  showVisualOpacityOption,
  showVisualShaderAdjustmentOption,
  updateVisualAnimation,
  updateVisualBlurField,
  updateVisualLayer,
  updateVisualOpacity,
  updateVisualShaderAdjustment,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";

const TEST_I18N = {
  resourcePages: {},
  sceneEditorPage: {},
  commandLinePage: {},
};

const createStoreApi = (state) => ({
  hideDropdownMenu: (payload) => hideDropdownMenu({ state }, payload),
  moveVisual: (payload) => moveVisual({ state }, payload),
  removeVisual: (payload) => removeVisual({ state }, payload),
  removeVisualBlurOption: (payload) =>
    removeVisualBlurOption({ state }, payload),
  removeVisualFlipOption: (payload) =>
    removeVisualFlipOption({ state }, payload),
  removeVisualOpacityOption: (payload) =>
    removeVisualOpacityOption({ state }, payload),
  removeVisualShaderAdjustmentOption: (payload) =>
    removeVisualShaderAdjustmentOption({ state }, payload),
  selectDropdownMenuType: () => selectDropdownMenuType({ state }),
  selectDropdownMenuVisualIndex: () => selectDropdownMenuVisualIndex({ state }),
  selectMode: () => selectMode({ state }),
  selectLayoutVisualItem: (payload) =>
    selectLayoutVisualItem({ state }, payload),
  selectSelectedVisualIndex: () => selectSelectedVisualIndex({ state }),
  selectSelectedVisuals: () => selectSelectedVisuals({ state }),
  selectVisualBlurOptionEnabled: (payload) =>
    selectVisualBlurOptionEnabled({ state }, payload),
  selectVisualFlipOptionEnabled: (payload) =>
    selectVisualFlipOptionEnabled({ state }, payload),
  selectVisualMedia: (payload) => selectVisualMedia({ state }, payload),
  selectVisualOpacityOptionEnabled: (payload) =>
    selectVisualOpacityOptionEnabled({ state }, payload),
  selectVisualShaderAdjustmentOptionEnabled: (payload) =>
    selectVisualShaderAdjustmentOptionEnabled({ state }, payload),
  showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
  showVisualBlurOption: (payload) => showVisualBlurOption({ state }, payload),
  showVisualFlipOption: (payload) => showVisualFlipOption({ state }, payload),
  showVisualOpacityOption: (payload) =>
    showVisualOpacityOption({ state }, payload),
  showVisualShaderAdjustmentOption: (payload) =>
    showVisualShaderAdjustmentOption({ state }, payload),
  updateVisualAnimation: (payload) => updateVisualAnimation({ state }, payload),
  updateVisualBlurField: (payload) => updateVisualBlurField({ state }, payload),
  updateVisualLayer: (payload) => updateVisualLayer({ state }, payload),
  updateVisualOpacity: (payload) => updateVisualOpacity({ state }, payload),
  updateVisualShaderAdjustment: (payload) =>
    updateVisualShaderAdjustment({ state }, payload),
});

const setAnimationCollection = (state) => {
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
        },
        tree: [{ id: "visual-fade" }],
      },
    },
  );
};

// Visuals are saved, and previewed, as layouts. These tests load no
// resources, so a visual picked from one resource becomes one element with no
// size, named by the resource id, and a picked shared layout is empty.
const MEDIA_ELEMENTS = {
  image: (resourceId) => ({ type: "sprite", imageId: resourceId }),
  video: (resourceId) => ({
    type: "video",
    videoId: resourceId,
    loop: false,
    volume: 100,
  }),
  spritesheet: (resourceId, animationName) => ({
    type: "spritesheet-animation",
    resourceId,
    animationName,
  }),
};

const SCREEN_LAYER = {
  x: 0,
  y: 0,
  anchorX: 0,
  anchorY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
};

// The fields that place a visual. A visual saved from one media resource has
// none: its layout puts the media where they placed it. The test transforms
// have no position, so only the visual's own fields place it.
const PLACEMENT_FIELDS = [
  "transformId",
  "transform",
  "x",
  "y",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "flipX",
  "flipY",
  "rotation",
  "originX",
  "originY",
];

const toSavedLayout = (
  resourceType,
  resourceId,
  animationName,
  placement = SCREEN_LAYER,
) => ({
  layoutSchemaVersion: 2,
  elements: {
    items: {
      content: {
        name: resourceId,
        ...placement,
        ...MEDIA_ELEMENTS[resourceType](resourceId, animationName),
      },
    },
    tree: [{ id: "content" }],
  },
});

// A visual as the panel saves it: a project layout by reference, and one
// image, spritesheet, video or particle as a custom layout that shows it.
const savedVisual = ({ resourceId, resourceType, animationName, ...item }) => {
  if (resourceType === "layout") {
    return { ...item, resourceId, resourceType };
  }

  const placement = {};
  for (const [field, defaultValue] of Object.entries(SCREEN_LAYER)) {
    placement[field] = item[field] ?? defaultValue;
  }
  if (item.flipX) {
    placement.scaleX *= -1;
  }
  if (item.flipY) {
    placement.scaleY *= -1;
  }
  const saved = { ...item };
  for (const field of PLACEMENT_FIELDS) {
    delete saved[field];
  }
  saved.layout = toSavedLayout(
    resourceType,
    resourceId,
    animationName,
    placement,
  );
  return saved;
};

describe("commandLineVisual.handlers animation controls", () => {
  it("updates and clears per-visual animation selection", () => {
    const state = createInitialState();
    const render = vi.fn();

    setAnimationCollection(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            transformId: "visual-center",
          },
        ],
      },
    );

    handleAnimationChange(
      {
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: "visual-fade",
          },
        },
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      animationMode: "update",
      animations: {
        resourceId: "visual-fade",
      },
    });

    handleAnimationChange(
      {
        store: createStoreApi(state),
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: undefined,
          },
        },
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      animationMode: "none",
    });
    expect(selectSelectedVisuals({ state })[0].animations).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("updates visual layer selection and emits temporary presentation state", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

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

    handleLayerChange(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: 30,
          },
        },
      },
    );

    expect(selectSelectedVisuals({ state })[0].layer).toBe(30);
    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        visual: {
          items: [
            savedVisual({
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 30,
            }),
          ],
        },
      },
    });
  });

  it("updates visual opacity and blur in temporary presentation state", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "blur" },
    });

    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 50,
          },
        ],
      },
    );

    handleOpacityInput(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
            },
          },
          detail: {
            value: "0.42",
          },
        },
      },
    );

    expect(selectSelectedVisuals({ state })[0].opacity).toBe(0.42);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        visual: {
          items: [
            savedVisual({
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 50,
              opacity: 0.42,
            }),
          ],
        },
      },
    });

    await handleFormSectionAction(
      {
        appService: { showDropdownMenu },
        dispatchEvent,
        i18n: TEST_I18N,
        render,
        store,
      },
      {
        _event: {
          detail: {
            actionId: "add",
            position: { x: 20, y: 30 },
            sectionId: "visual-0",
          },
        },
      },
    );

    expect(showDropdownMenu.mock.calls[0][0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "blur" }),
        expect.objectContaining({ key: "flip-x" }),
      ]),
    );
    expect(showDropdownMenu.mock.calls[0][0].items).not.toContainEqual(
      expect.objectContaining({ key: "opacity" }),
    );
    expect(selectVisualBlurOptionEnabled({ state }, { index: 0 })).toBe(true);

    handleBlurFieldInput(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
              blurField: "x",
            },
          },
          detail: {
            value: "12",
          },
        },
      },
    );
    handleBlurFieldChange(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              index: "0",
              blurField: "kernelSize",
            },
          },
          detail: {
            value: 14,
          },
        },
      },
    );

    expect(selectSelectedVisuals({ state })[0].blur).toEqual({
      x: 12,
      y: 9,
      quality: 3,
      kernelSize: 13,
      repeatEdgePixels: true,
    });
    expect(dispatchEvent.mock.calls[3][0].detail).toEqual({
      presentationState: {
        visual: {
          items: [
            savedVisual({
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 50,
              opacity: 0.42,
              blur: {
                x: 12,
                y: 9,
                quality: 3,
                kernelSize: 13,
                repeatEdgePixels: true,
              },
            }),
          ],
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(4);
  });

  it("emits null when visual blur is disabled", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 50,
            blur: {
              x: 6,
              y: 9,
              quality: 3,
              kernelSize: 9,
              repeatEdgePixels: true,
            },
          },
        ],
      },
    );

    await handleFormSectionAction(
      {
        dispatchEvent,
        render,
        store,
      },
      {
        _event: {
          detail: {
            actionId: "remove",
            sectionId: "visual-0-blur",
          },
        },
      },
    );

    expect(selectSelectedVisuals({ state })[0].blur).toBeNull();
    expect(selectVisualBlurOptionEnabled({ state }, { index: 0 })).toBe(false);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        visual: {
          items: [
            savedVisual({
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 50,
              blur: null,
            }),
          ],
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("shows and removes the visual opacity option from the section action", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "opacity" },
    });

    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 50,
          },
        ],
      },
    );

    const deps = {
      appService: { showDropdownMenu },
      dispatchEvent,
      i18n: TEST_I18N,
      render,
      store,
    };

    expect(selectVisualOpacityOptionEnabled({ state }, { index: 0 })).toBe(
      false,
    );

    await handleFormSectionAction(deps, {
      _event: {
        detail: {
          actionId: "add",
          position: { x: 20, y: 30 },
          sectionId: "visual-0",
        },
      },
    });

    expect(selectSelectedVisuals({ state })[0].opacity).toBe(1);
    expect(selectVisualOpacityOptionEnabled({ state }, { index: 0 })).toBe(
      true,
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      presentationState: {
        visual: {
          items: [{ opacity: 1 }],
        },
      },
    });

    await handleFormSectionAction(deps, {
      _event: {
        detail: {
          actionId: "remove",
          sectionId: "visual-0-opacity",
        },
      },
    });

    expect(selectSelectedVisuals({ state })[0].opacity).toBeUndefined();
    expect(selectVisualOpacityOptionEnabled({ state }, { index: 0 })).toBe(
      false,
    );
    expect(
      dispatchEvent.mock.calls[1][0].detail.presentationState.visual.items[0]
        .opacity,
    ).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("shows and removes the visual blur option from the section action", async () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);
    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "blur" },
    });

    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 50,
          },
        ],
      },
    );

    const deps = {
      appService: { showDropdownMenu },
      dispatchEvent,
      i18n: TEST_I18N,
      render,
      store,
    };

    expect(selectVisualBlurOptionEnabled({ state }, { index: 0 })).toBe(false);

    await handleFormSectionAction(deps, {
      _event: {
        detail: {
          actionId: "add",
          position: { x: 20, y: 30 },
          sectionId: "visual-0",
        },
      },
    });

    expect(selectSelectedVisuals({ state })[0].blur).toEqual({
      x: 6,
      y: 9,
      quality: 3,
      kernelSize: 9,
      repeatEdgePixels: true,
    });
    expect(selectVisualBlurOptionEnabled({ state }, { index: 0 })).toBe(true);
    expect(dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      presentationState: {
        visual: {
          items: [{ blur: { x: 6, y: 9 } }],
        },
      },
    });

    await handleFormSectionAction(deps, {
      _event: {
        detail: {
          actionId: "remove",
          sectionId: "visual-0-blur",
        },
      },
    });

    expect(selectSelectedVisuals({ state })[0].blur).toBeNull();
    expect(selectVisualBlurOptionEnabled({ state }, { index: 0 })).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("moves visuals from the context menu and emits reordered preview data", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 50,
          },
          {
            id: "visual-2",
            resourceId: "visual-video",
            resourceType: "video",
            transformId: "visual-center",
            layer: 50,
          },
          {
            id: "visual-3",
            resourceId: "visual-layout",
            resourceType: "layout",
            transformId: "visual-center",
            layer: 90,
          },
        ],
      },
    );
    showDropdownMenu(
      { state },
      {
        position: { x: 12, y: 24 },
        visualIndex: 1,
      },
    );

    handleDropdownMenuClickItem(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            item: {
              value: "move-up",
            },
          },
        },
      },
    );

    expect(selectSelectedVisuals({ state }).map((visual) => visual.id)).toEqual(
      ["visual-3", "visual-2", "visual-1"],
    );
    expect(selectDropdownMenuVisualIndex({ state })).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        visual: {
          items: [
            savedVisual({
              id: "visual-3",
              resourceId: "visual-layout",
              resourceType: "layout",
              transformId: "visual-center",
              layer: 90,
            }),
            savedVisual({
              id: "visual-2",
              resourceId: "visual-video",
              resourceType: "video",
              transformId: "visual-center",
              layer: 50,
            }),
            savedVisual({
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 50,
            }),
          ],
        },
      },
    });
  });

  it("submits animations for selected visuals without changing other data keys", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setAnimationCollection(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 30,
            opacity: 0.5,
            blur: {
              x: 6,
              y: 9,
              quality: 3,
              kernelSize: 9,
              repeatEdgePixels: true,
            },
            animations: {
              resourceId: "visual-fade",
              playback: {
                continuity: "render",
                loop: false,
                speed: 1,
              },
            },
          },
        ],
      },
    );

    handleSubmitClick({
      dispatchEvent,
      store: createStoreApi(state),
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      visual: {
        items: [
          savedVisual({
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 30,
            opacity: 0.5,
            blur: {
              x: 6,
              y: 9,
              quality: 3,
              kernelSize: 9,
              repeatEdgePixels: true,
            },
            animations: {
              resourceId: "visual-fade",
              playback: {
                continuity: "render",
                loop: false,
                speed: 1,
              },
            },
          }),
        ],
      },
    });
  });

  it("requests the shared transform editor from the custom transform summary", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      currentTarget: {
        dataset: {
          index: "0",
          targetName: "Visual One",
        },
      },
    };

    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 50,
          },
        ],
      },
    );

    handleCustomTransformButtonClick(
      {
        store: createStoreApi(state),
        dispatchEvent,
      },
      { _event: event },
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "action-transform-customize",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      targetType: "visual",
      actionKey: "visual",
      itemIndex: 0,
      item: savedVisual({
        id: "visual-1",
        resourceId: "visual-image",
        resourceType: "image",
        transformId: "visual-center",
        layer: 50,
      }),
      targetName: "Visual One",
      action: {
        items: [
          savedVisual({
            id: "visual-1",
            resourceId: "visual-image",
            resourceType: "image",
            transformId: "visual-center",
            layer: 50,
          }),
        ],
      },
    });
  });

  it("opens the custom transform summary with the keyboard", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const event = {
      key: "Enter",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
      currentTarget: {
        dataset: {
          index: "0",
          targetName: "Visual One",
        },
      },
    };

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

    handleCustomTransformButtonKeyDown(
      {
        store: createStoreApi(state),
        dispatchEvent,
      },
      { _event: event },
    );

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "action-transform-customize",
    );
  });

  it("previews and submits per-visual shader adjustments", async () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const store = createStoreApi(state);
    const customFilter = {
      id: "customFilter",
      type: "shader",
      parameters: { strength: 0.5 },
      source: {},
    };
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

    handleShaderAdjustmentInput(
      { dispatchEvent, render, store },
      {
        _event: {
          currentTarget: {
            dataset: { index: "0", adjustmentId: "brightness" },
          },
          detail: { value: "0.3" },
        },
      },
    );

    const showDropdownMenu = vi.fn().mockResolvedValue({
      item: { key: "saturation" },
    });
    await handleFormSectionAction(
      {
        appService: { showDropdownMenu },
        dispatchEvent,
        i18n: TEST_I18N,
        render,
        store,
      },
      {
        _event: {
          detail: {
            actionId: "add",
            position: { x: 20, y: 30 },
            sectionId: "visual-0",
          },
        },
      },
    );
    handleSubmitClick({ dispatchEvent, store });

    expect(showDropdownMenu.mock.calls[0][0].items).not.toContainEqual(
      expect.objectContaining({ key: "brightness" }),
    );
    expect(
      selectSelectedVisuals({ state })[0].filters.map(({ id }) => id),
    ).toEqual(["customFilter", "backgroundBrightness", "backgroundSaturation"]);
    expect(
      dispatchEvent.mock.calls.at(-1)[0].detail.visual.items[0].filters,
    ).toEqual(selectSelectedVisuals({ state })[0].filters);
  });

  it("adds, previews, submits, and removes per-visual flip options", async () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const store = createStoreApi(state);
    const showDropdownMenu = vi
      .fn()
      .mockResolvedValueOnce({ item: { key: "flip-x" } })
      .mockResolvedValueOnce({ item: { key: "flip-y" } });
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

    const deps = {
      appService: { showDropdownMenu },
      dispatchEvent,
      i18n: TEST_I18N,
      render,
      store,
    };
    const addPayload = {
      _event: {
        detail: {
          actionId: "add",
          position: { x: 20, y: 30 },
          sectionId: "visual-0",
        },
      },
    };

    await handleFormSectionAction(deps, addPayload);
    await handleFormSectionAction(deps, addPayload);

    expect(showDropdownMenu.mock.calls[0][0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "flip-x", label: "Flip X" }),
        expect.objectContaining({ key: "flip-y", label: "Flip Y" }),
      ]),
    );
    expect(showDropdownMenu.mock.calls[1][0].items).not.toContainEqual(
      expect.objectContaining({ key: "flip-x" }),
    );
    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      flipX: true,
      flipY: true,
    });
    // The flips are saved as the layout element's scale.
    expect(dispatchEvent.mock.calls[1][0].detail).toMatchObject({
      presentationState: {
        visual: {
          items: [
            {
              layout: {
                elements: {
                  items: { content: { scaleX: -1, scaleY: -1 } },
                },
              },
            },
          ],
        },
      },
    });
    expect(
      dispatchEvent.mock.calls[1][0].detail.presentationState.visual.items[0],
    ).not.toHaveProperty("flipX");

    handleSubmitClick({ dispatchEvent, store });
    expect(dispatchEvent.mock.calls[2][0].detail).toMatchObject({
      visual: {
        items: [
          {
            layout: {
              elements: {
                items: { content: { scaleX: -1, scaleY: -1 } },
              },
            },
          },
        ],
      },
    });

    await handleFormSectionAction(deps, {
      _event: {
        detail: {
          actionId: "remove",
          sectionId: "visual-0-flip-x",
        },
      },
    });
    expect(selectSelectedVisuals({ state })[0].flipX).toBe(false);
    expect(selectSelectedVisuals({ state })[0].flipY).toBe(true);
    expect(dispatchEvent.mock.calls[3][0].detail).toMatchObject({
      presentationState: {
        visual: {
          items: [
            {
              layout: {
                elements: {
                  items: { content: { scaleX: 1, scaleY: -1 } },
                },
              },
            },
          ],
        },
      },
    });

    handleSubmitClick({ dispatchEvent, store });
    expect(dispatchEvent.mock.calls[4][0].detail).toMatchObject({
      visual: {
        items: [
          {
            layout: {
              elements: {
                items: { content: { scaleX: 1, scaleY: -1 } },
              },
            },
          },
        ],
      },
    });
  });
});
