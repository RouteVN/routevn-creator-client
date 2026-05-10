import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectEditForm,
  selectViewData,
  setAnimations,
  setEditingIndex,
  setItems,
  setScenes,
} from "../../src/components/commandLineChoices/commandLineChoices.store.js";

describe("commandLineChoices.store", () => {
  it("prefills and offers screen animations for choice section transitions", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        items: [
          {
            content: "Leave",
            events: {
              click: {
                actions: {
                  sectionTransition: {
                    sceneId: "scene-1",
                    sectionId: "section-2",
                    screen: {
                      animations: {
                        resourceId: "screen-crossfade",
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    );
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
                  "section-2": {
                    id: "section-2",
                    type: "section",
                    name: "Exit",
                  },
                },
                tree: [{ id: "section-2" }],
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
            "pulse-update": {
              id: "pulse-update",
              type: "animation",
              name: "Pulse",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "screen-crossfade" }, { id: "pulse-update" }],
        },
      },
    );

    setEditingIndex({ state }, { index: 0 });

    const viewData = selectViewData({ state, props: { layouts: [] } });

    expect(selectEditForm({ state }).transitionAnimationId).toBe(
      "screen-crossfade",
    );
    expect(viewData.editFormContext.transitionAnimationOptions).toEqual([
      {
        value: "screen-crossfade",
        label: "Screen Crossfade",
      },
    ]);
  });
});
