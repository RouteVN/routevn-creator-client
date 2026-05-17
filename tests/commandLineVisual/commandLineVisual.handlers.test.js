import { describe, expect, it, vi } from "vitest";
import {
  handleAddVisualClick,
  handleAnimationChange,
  handleResourceItemClick,
  handleSubmitClick,
  handleTabClick,
  handleVisualClick,
} from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";
import {
  addVisual,
  createInitialState,
  selectDefaultTransformId,
  selectMode,
  selectSelectedVisuals,
  selectSelectedVisualIndex,
  selectTab,
  selectTempSelectedResourceId,
  selectTempSelectedResourceType,
  setAnimations,
  setExistingVisuals,
  setMode,
  setSelectedVisualIndex,
  setTab,
  setTempSelectedResourceId,
  setTransforms,
  updateVisualResource,
  updateVisualAnimation,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";

const createStoreApi = (state) => ({
  addVisual: (payload) => addVisual({ state }, payload),
  selectDefaultTransformId: () => selectDefaultTransformId({ state }),
  selectMode: () => selectMode({ state }),
  selectSelectedVisualIndex: () => selectSelectedVisualIndex({ state }),
  selectSelectedVisuals: () => selectSelectedVisuals({ state }),
  selectTab: () => selectTab({ state }),
  selectTempSelectedResourceId: () => selectTempSelectedResourceId({ state }),
  selectTempSelectedResourceType: () =>
    selectTempSelectedResourceType({ state }),
  setMode: (payload) => setMode({ state }, payload),
  setSelectedVisualIndex: (payload) =>
    setSelectedVisualIndex({ state }, payload),
  setTab: (payload) => setTab({ state }, payload),
  setTempSelectedResourceId: (payload) =>
    setTempSelectedResourceId({ state }, payload),
  updateVisualAnimation: (payload) => updateVisualAnimation({ state }, payload),
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
          },
          tree: [{ id: "visual-center" }],
        },
      },
    );

    handleAddVisualClick({
      store,
      render,
    });
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
              transformId: "visual-center",
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
            },
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
