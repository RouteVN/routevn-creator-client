import { describe, expect, it, vi } from "vitest";
import {
  handleAnimationChange,
  handleAnimationModeChange,
  handleSubmitClick,
} from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";
import {
  createInitialState,
  selectSelectedVisuals,
  setAnimations,
  setExistingVisuals,
  updateVisualAnimation,
  updateVisualAnimationMode,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";

const createStoreApi = (state) => ({
  selectSelectedVisuals: () => selectSelectedVisuals({ state }),
  updateVisualAnimation: (payload) => updateVisualAnimation({ state }, payload),
  updateVisualAnimationMode: (payload) =>
    updateVisualAnimationMode({ state }, payload),
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
