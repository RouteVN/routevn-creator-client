import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAnimations,
  setFormValues,
  setScenes,
} from "../../src/components/commandLineSectionTransition/commandLineSectionTransition.store.js";
import { EN_I18N } from "../support/i18n.js";

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
      i18n: EN_I18N,
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
    expect(viewData.form.fields[0]).toMatchObject({
      type: "row",
      fields: [{ name: "sceneId" }, { name: "sectionId" }],
    });
    expect(viewData.form.fields[1]).toMatchObject({
      name: "transitionAnimationId",
      label: "Animation",
      type: "select",
    });
    expect(viewData.form.fields[2]).toMatchObject({
      type: "row",
      fields: [
        {
          name: "playbackSpeed",
          type: "slider-with-input",
          min: 0.1,
          max: 3,
          step: 0.1,
        },
        { name: "playbackContinuity", type: "segmented-control" },
      ],
    });
  });
});
