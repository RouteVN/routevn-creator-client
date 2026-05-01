import { describe, expect, it, vi } from "vitest";
import {
  handleAddVisualClick,
  handleAnimationChange,
  handleAnimationModeChange,
  handleResourceItemClick,
  handleSubmitClick,
} from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";
import {
  addVisual,
  createInitialState,
  selectDefaultTransformId,
  selectMode,
  selectSelectedVisuals,
  selectSelectedVisualIndex,
  selectTempSelectedResourceId,
  setAnimations,
  setExistingVisuals,
  setMode,
  setSelectedVisualIndex,
  setTempSelectedResourceId,
  setTransforms,
  updateVisualResource,
  updateVisualAnimation,
  updateVisualAnimationMode,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";

const createStoreApi = (state) => ({
  addVisual: (payload) => addVisual({ state }, payload),
  selectDefaultTransformId: () => selectDefaultTransformId({ state }),
  selectMode: () => selectMode({ state }),
  selectSelectedVisualIndex: () => selectSelectedVisualIndex({ state }),
  selectSelectedVisuals: () => selectSelectedVisuals({ state }),
  selectTempSelectedResourceId: () => selectTempSelectedResourceId({ state }),
  setMode: (payload) => setMode({ state }, payload),
  setSelectedVisualIndex: (payload) =>
    setSelectedVisualIndex({ state }, payload),
  setTempSelectedResourceId: (payload) =>
    setTempSelectedResourceId({ state }, payload),
  updateVisualAnimation: (payload) => updateVisualAnimation({ state }, payload),
  updateVisualAnimationMode: (payload) =>
    updateVisualAnimationMode({ state }, payload),
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
  it("updates per-visual animation mode and animation selection", () => {
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

    handleAnimationModeChange(
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
            value: "update",
          },
        },
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
              resourceId: "visual-image",
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
              id: "temporary-visual-preview",
              resourceId: "visual-image",
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
            transformId: "visual-center",
            animations: {
              resourceId: "visual-fade",
            },
          },
        ],
      },
    });
  });
});
