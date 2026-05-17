import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectSelectedVisuals,
  selectViewData,
  setAnimations,
  setExistingVisuals,
  setImages,
  setLayouts,
  setTab,
  setTransforms,
  setVideos,
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
      id: "visual-video-item",
      resourceId: "visual-video",
      resourceType: "video",
      displayName: "Intro Video",
      fileId: "file-intro-thumbnail",
    });
    expect(viewData.defaultValues.visuals[1]).toMatchObject({
      id: "visual-layout-item",
      resourceId: "visual-layout",
      resourceType: "layout",
      displayName: "Poster Layout",
      fileId: "file-poster-layout",
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
