import { describe, expect, it, vi } from "vitest";
import {
  handleAddVisualFormAction,
  handleAddVisualClick,
  handleAnimationChange,
  handleBlurFieldChange,
  handleBlurFieldInput,
  handleBlurToggleChange,
  handleButtonSelectClick,
  handleDropdownMenuClickItem,
  handleLayerChange,
  handleOpacityInput,
  handleResourceItemClick,
  handleSubmitClick,
  handleTabClick,
  handleVisualClick,
} from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";
import {
  addVisual,
  clearPendingVisualConfig,
  clearPendingVisualLayer,
  clearPendingVisualTransformId,
  createInitialState,
  hideAddVisualPopover,
  hideDropdownMenu,
  moveVisual,
  openAddVisualPopover,
  removeVisual,
  selectDefaultTransformId,
  selectDefaultVisualLayer,
  selectDropdownMenuType,
  selectDropdownMenuVisualIndex,
  selectMode,
  selectPendingVisualLayer,
  selectPendingVisualTransformId,
  selectSelectedVisuals,
  selectSelectedVisualIndex,
  selectTab,
  selectTempSelectedResourceId,
  selectTempSelectedResourceType,
  setAnimations,
  setExistingVisuals,
  setMode,
  setPendingVisualLayer,
  setPendingVisualTransformId,
  setSelectedVisualIndex,
  setTab,
  setTempSelectedResourceId,
  setTransforms,
  showDropdownMenu,
  updateVisualResource,
  updateVisualAnimation,
  updateVisualBlurEnabled,
  updateVisualBlurField,
  updateVisualLayer,
  updateVisualOpacity,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";

const createStoreApi = (state) => ({
  addVisual: (payload) => addVisual({ state }, payload),
  clearPendingVisualConfig: (payload) =>
    clearPendingVisualConfig({ state }, payload),
  clearPendingVisualLayer: (payload) =>
    clearPendingVisualLayer({ state }, payload),
  clearPendingVisualTransformId: (payload) =>
    clearPendingVisualTransformId({ state }, payload),
  hideAddVisualPopover: (payload) => hideAddVisualPopover({ state }, payload),
  hideDropdownMenu: (payload) => hideDropdownMenu({ state }, payload),
  moveVisual: (payload) => moveVisual({ state }, payload),
  openAddVisualPopover: (payload) => openAddVisualPopover({ state }, payload),
  removeVisual: (payload) => removeVisual({ state }, payload),
  selectDefaultTransformId: () => selectDefaultTransformId({ state }),
  selectDefaultVisualLayer: () => selectDefaultVisualLayer({ state }),
  selectDropdownMenuType: () => selectDropdownMenuType({ state }),
  selectDropdownMenuVisualIndex: () => selectDropdownMenuVisualIndex({ state }),
  selectMode: () => selectMode({ state }),
  selectPendingVisualLayer: () => selectPendingVisualLayer({ state }),
  selectPendingVisualTransformId: () =>
    selectPendingVisualTransformId({ state }),
  selectSelectedVisualIndex: () => selectSelectedVisualIndex({ state }),
  selectSelectedVisuals: () => selectSelectedVisuals({ state }),
  selectTab: () => selectTab({ state }),
  selectTempSelectedResourceId: () => selectTempSelectedResourceId({ state }),
  selectTempSelectedResourceType: () =>
    selectTempSelectedResourceType({ state }),
  setMode: (payload) => setMode({ state }, payload),
  setPendingVisualLayer: (payload) => setPendingVisualLayer({ state }, payload),
  setPendingVisualTransformId: (payload) =>
    setPendingVisualTransformId({ state }, payload),
  setSelectedVisualIndex: (payload) =>
    setSelectedVisualIndex({ state }, payload),
  setTab: (payload) => setTab({ state }, payload),
  setTempSelectedResourceId: (payload) =>
    setTempSelectedResourceId({ state }, payload),
  showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
  updateVisualAnimation: (payload) => updateVisualAnimation({ state }, payload),
  updateVisualBlurEnabled: (payload) =>
    updateVisualBlurEnabled({ state }, payload),
  updateVisualBlurField: (payload) => updateVisualBlurField({ state }, payload),
  updateVisualLayer: (payload) => updateVisualLayer({ state }, payload),
  updateVisualOpacity: (payload) => updateVisualOpacity({ state }, payload),
  updateVisualResource: (payload) => updateVisualResource({ state }, payload),
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

  it("emits temporary presentation state while picking a new visual resource", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

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

    handleAddVisualClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            getBoundingClientRect: () => ({
              left: 24,
              bottom: 64,
            }),
          },
        },
      },
    );
    expect(state.addVisualPopover).toMatchObject({
      isOpen: true,
      position: { x: 24, y: 64 },
    });

    handleAddVisualFormAction(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            actionId: "submit",
            values: {
              transformId: "visual-left",
              layer: 70,
            },
          },
        },
      },
    );
    expect(selectMode({ state })).toBe("resource-select");
    expect(selectSelectedVisualIndex({ state })).toBe(-1);
    expect(selectPendingVisualTransformId({ state })).toBe("visual-left");
    expect(selectPendingVisualLayer({ state })).toBe(70);
    expect(state.addVisualPopover.isOpen).toBe(false);

    handleResourceItemClick(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              resourceId: "visual-video",
              resourceType: "video",
            },
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        visual: {
          items: [
            {
              id: "temporary-visual-preview-video",
              resourceId: "visual-video",
              resourceType: "video",
              transformId: "visual-left",
              layer: 70,
            },
          ],
        },
      },
    });
  });

  it("uses a temporary id when an existing visual changes resource type", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();

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
    setMode({ state }, { mode: "resource-select" });
    setSelectedVisualIndex({ state }, { index: 0 });

    handleResourceItemClick(
      {
        store: createStoreApi(state),
        render,
        dispatchEvent,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              resourceId: "visual-layout",
              resourceType: "layout",
            },
          },
        },
      },
    );

    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        visual: {
          items: [
            {
              id: "visual-1-layout-preview",
              resourceId: "visual-layout",
              resourceType: "layout",
              transformId: "visual-center",
              layer: 50,
            },
          ],
        },
      },
    });
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
            {
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 30,
            },
          ],
        },
      },
    });
  });

  it("updates visual opacity and blur in temporary presentation state", () => {
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
            {
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 50,
              opacity: 0.42,
            },
          ],
        },
      },
    });

    handleBlurToggleChange(
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
            value: true,
          },
        },
      },
    );
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
            {
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
            },
          ],
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(4);
  });

  it("emits null when visual blur is disabled", () => {
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

    handleBlurToggleChange(
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
            value: false,
          },
        },
      },
    );

    expect(selectSelectedVisuals({ state })[0].blur).toBeNull();
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        visual: {
          items: [
            {
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 50,
              blur: null,
            },
          ],
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
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
            {
              id: "visual-3",
              resourceId: "visual-layout",
              resourceType: "layout",
              transformId: "visual-center",
              layer: 90,
            },
            {
              id: "visual-2",
              resourceId: "visual-video",
              resourceType: "video",
              transformId: "visual-center",
              layer: 50,
            },
            {
              id: "visual-1",
              resourceId: "visual-image",
              resourceType: "image",
              transformId: "visual-center",
              layer: 50,
            },
          ],
        },
      },
    });
  });

  it("adds a new visual with the selected add-form transform and layer", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const appService = {
      showAlert: vi.fn(),
    };
    const store = createStoreApi(state);

    setPendingVisualLayer(
      { state },
      {
        layer: 10,
      },
    );
    setPendingVisualTransformId(
      { state },
      {
        transformId: "visual-left",
      },
    );
    setMode({ state }, { mode: "resource-select" });
    setSelectedVisualIndex({ state }, { index: -1 });
    setTempSelectedResourceId(
      { state },
      {
        resourceId: "visual-image",
        resourceType: "image",
      },
    );

    handleButtonSelectClick({
      appService,
      store,
      render,
      dispatchEvent,
    });

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      resourceId: "visual-image",
      resourceType: "image",
      transformId: "visual-left",
      layer: 10,
    });
    expect(selectMode({ state })).toBe("current");
    expect(selectTempSelectedResourceId({ state })).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(
      dispatchEvent.mock.calls[0][0].detail.presentationState.visual.items[0],
    ).toMatchObject({
      resourceId: "visual-image",
      resourceType: "image",
      transformId: "visual-left",
      layer: 10,
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
            },
          },
        ],
      },
    });
  });

  it("switches resource tabs and clears hidden temporary selection", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setTempSelectedResourceId(
      { state },
      {
        resourceId: "visual-video",
        resourceType: "video",
      },
    );

    handleTabClick(
      {
        store,
        render,
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            id: "layout",
          },
        },
      },
    );

    expect(selectTab({ state })).toBe("layout");
    expect(selectTempSelectedResourceId({ state })).toBeUndefined();
    expect(selectTempSelectedResourceType({ state })).toBeUndefined();
    expect(render).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("opens existing visual selection on the visual resource tab", () => {
    const state = createInitialState();
    const render = vi.fn();

    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-video",
            resourceType: "video",
          },
        ],
      },
    );

    handleVisualClick(
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
        },
      },
    );

    expect(selectSelectedVisualIndex({ state })).toBe(0);
    expect(selectMode({ state })).toBe("resource-select");
    expect(selectTab({ state })).toBe("video");
    expect(render).toHaveBeenCalledTimes(1);
  });
});
