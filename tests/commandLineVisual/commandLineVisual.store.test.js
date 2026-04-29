import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectSelectedVisuals,
  selectViewData,
  setAnimations,
  setExistingVisuals,
  setImages,
  setTransforms,
  updateVisualAnimation,
  updateVisualAnimationMode,
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
      transformId: "visual-center",
      animationMode: "transition",
      animationId: "visual-wipe",
    });
    expect(viewData.defaultValues.animationModeOptions).toEqual([
      { label: "None", value: "none" },
      { label: "Update", value: "update" },
      { label: "Transition", value: "transition" },
    ]);
    expect(viewData.defaultValues.updateAnimationOptions).toEqual([
      {
        value: "visual-fade",
        label: "Fade",
      },
    ]);
    expect(viewData.defaultValues.transitionAnimationOptions).toEqual([
      {
        value: "visual-wipe",
        label: "Wipe",
      },
    ]);
  });

  it("clears mismatched visual animation selections when mode changes", () => {
    const state = createInitialState();
    setRepositoryCollections(state);
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            resourceId: "visual-image",
            transformId: "visual-center",
            animations: {
              resourceId: "visual-wipe",
            },
          },
        ],
      },
    );

    updateVisualAnimationMode(
      { state },
      {
        index: 0,
        animationMode: "update",
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      animationMode: "update",
    });
    expect(selectSelectedVisuals({ state })[0].animations).toBeUndefined();

    updateVisualAnimation(
      { state },
      {
        index: 0,
        animationId: "visual-fade",
      },
    );

    expect(selectSelectedVisuals({ state })[0]).toMatchObject({
      animationMode: "update",
      animations: {
        resourceId: "visual-fade",
      },
    });

    updateVisualAnimationMode(
      { state },
      {
        index: 0,
        animationMode: "none",
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

    expect(viewData.defaultValues.updateAnimationOptions).toEqual([]);
    expect(viewData.defaultValues.transitionAnimationOptions).toEqual([]);
  });
});
