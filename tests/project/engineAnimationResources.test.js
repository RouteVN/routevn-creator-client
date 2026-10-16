import { describe, expect, it } from "vitest";
import createRouteEngine from "route-engine-js";
import {
  constructProjectData,
  projectRepositoryStateToDomainState,
  recursivelyCheckResource,
} from "../../src/internal/project/projection.js";

const createTreeCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

const MASK = {
  kind: "single",
  imageId: "wipe-mask",
  channel: "red",
  softness: 0.1,
  progressDuration: 900,
  progressEasing: "linear",
};

// A character enters on the first line with the "enter" animation.
const createRepositoryState = (animation) => ({
  project: { resolution: { width: 1920, height: 1080 } },
  story: { initialSceneId: "scene-1" },
  images: createTreeCollection({
    "wipe-mask": {
      id: "wipe-mask",
      type: "image",
      name: "Wipe mask",
      fileId: "wipe-mask-file",
      width: 64,
      height: 64,
    },
  }),
  characters: createTreeCollection({
    hero: {
      id: "hero",
      type: "character",
      name: "Hero",
      sprites: createTreeCollection({
        body: {
          id: "body",
          type: "image",
          name: "Body",
          fileId: "body-file",
          width: 320,
          height: 640,
        },
      }),
    },
  }),
  transforms: createTreeCollection({
    center: {
      id: "center",
      type: "transform",
      x: 960,
      y: 1080,
      anchorX: 0.5,
      anchorY: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
  }),
  animations: createTreeCollection({
    enter: {
      id: "enter",
      type: "animation",
      name: "Enter",
      animation,
    },
  }),
  scenes: createTreeCollection({
    "scene-1": {
      id: "scene-1",
      type: "scene",
      name: "Scene 1",
      sections: createTreeCollection({
        "section-1": {
          id: "section-1",
          name: "Section 1",
          lines: createTreeCollection({
            "line-1": {
              id: "line-1",
              actions: {
                character: {
                  items: [
                    {
                      id: "hero",
                      transformId: "center",
                      sprites: [{ id: "body", resourceId: "body" }],
                      animations: { resourceId: "enter" },
                    },
                  ],
                },
              },
            },
          }),
        },
      }),
    },
  }),
});

const selectRouteEngineRenderState = (projectData) => {
  const engine = createRouteEngine({
    handlePendingEffects() {},
  });
  engine.init({ initialState: { global: {}, projectData } });
  return engine.selectRenderState();
};

describe("animation resources in Route Engine project data", () => {
  it.each([
    ["has nothing added yet", { type: "transition" }],
    [
      "lost its mask image",
      { type: "transition", mask: { ...MASK, imageId: "deleted-image" } },
    ],
  ])(
    "shows the character without a transition that %s",
    (_label, animation) => {
      const projectData = constructProjectData(
        createRepositoryState(animation),
      );

      const renderState = selectRouteEngineRenderState(projectData);
      expect(renderState.animations).toEqual([]);
      expect(projectData.resources.animations.enter).toBeUndefined();
    },
  );

  it("keeps a transition that has a mask", () => {
    const projectData = constructProjectData(
      createRepositoryState({ type: "transition", mask: MASK }),
    );

    expect(projectData.resources.animations.enter.mask).toMatchObject({
      texture: "wipe-mask-file",
    });
    expect(selectRouteEngineRenderState(projectData).animations).toEqual([
      expect.objectContaining({
        id: "character-container-hero-animation-in",
        type: "transition",
      }),
    ]);
  });

  it("counts a mask image as used while a line picks its transition", () => {
    const state = projectRepositoryStateToDomainState({
      repositoryState: createRepositoryState({
        type: "transition",
        mask: MASK,
      }),
      projectId: "project-one",
    });

    const usage = recursivelyCheckResource({
      state,
      itemId: "wipe-mask",
      checkTargets: ["scenes", "layouts", "controls"],
    });

    expect(usage.isUsed).toBe(true);
    expect(usage.inProps.animations).toEqual([{ property: "imageId" }]);
  });
});
