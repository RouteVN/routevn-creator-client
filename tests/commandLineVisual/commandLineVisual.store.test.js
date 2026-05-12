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
});
