import { describe, expect, it } from "vitest";
import { constructProjectData } from "../../src/internal/project/projection.js";

const createTreeCollection = (items = {}) => ({
  items,
  tree: Object.keys(items).map((id) => ({ id })),
});

// A character enters on the first line with the "enter" animation.
const createRepositoryState = (animation) => ({
  project: { resolution: { width: 1920, height: 1080 } },
  story: { initialSceneId: "scene-1" },
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

describe("Auto tweens in Route Engine project data", () => {
  // Route Graphics reads an Auto tween's end value from the element's state,
  // which has no translate offsets.
  it("leaves out Auto tweens on properties Route Graphics cannot resolve", () => {
    const auto = { auto: { duration: 400, easing: "linear" } };
    const projectData = constructProjectData(
      createRepositoryState({
        type: "update",
        tween: { translateX: auto, translateY: auto, alpha: auto },
      }),
    );

    expect(projectData.resources.animations.enter).toEqual({
      type: "update",
      tween: { alpha: auto },
    });
  });

  it("keeps Auto tweens on properties it can resolve", () => {
    const auto = { auto: { duration: 400, easing: "linear" } };
    const projectData = constructProjectData(
      createRepositoryState({
        type: "update",
        tween: {
          alpha: auto,
          x: auto,
          scaleX: auto,
          rotation: auto,
          blurX: auto,
          blurY: auto,
        },
      }),
    );

    expect(projectData.resources.animations.enter.tween).toEqual({
      alpha: auto,
      x: auto,
      scaleX: auto,
      rotation: auto,
      blurX: auto,
      blurY: auto,
    });
  });
});
