import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAnimations,
  setFormValues,
  setScenes,
} from "../../src/components/commandLineSectionTransition/commandLineSectionTransition.store.js";

describe("commandLineSectionTransition.store", () => {
  it("builds transition animation options from animation resources", () => {
    const state = createInitialState();

    setScenes(
      { state },
      {
        scenes: {
          items: {
            "scene-1": {
              id: "scene-1",
              type: "scene",
              name: "Opening",
              sections: {
                items: {
                  "section-1": {
                    id: "section-1",
                    type: "section",
                    name: "Intro",
                  },
                },
                tree: [{ id: "section-1" }],
              },
            },
          },
          tree: [{ id: "scene-1" }],
        },
      },
    );
    setAnimations(
      { state },
      {
        animations: {
          items: {
            "screen-crossfade": {
              id: "screen-crossfade",
              type: "animation",
              name: "Screen Crossfade",
              animation: {
                type: "transition",
              },
            },
            "shake-update": {
              id: "shake-update",
              type: "animation",
              name: "Shake",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "screen-crossfade" }, { id: "shake-update" }],
        },
      },
    );
    setFormValues(
      { state },
      {
        sceneId: "scene-1",
        sectionId: "section-1",
        transitionAnimationId: "screen-crossfade",
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        currentSceneId: "scene-1",
      },
    });

    expect(viewData.context.transitionAnimationOptions).toEqual([
      {
        value: "screen-crossfade",
        label: "Screen Crossfade",
      },
    ]);
  });
});
