import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setFormValues,
  setScenes,
} from "../../src/components/commandLineResetStoryAtSection/commandLineResetStoryAtSection.store.js";

describe("commandLineResetStoryAtSection.store", () => {
  it("shows section options for the selected scene", () => {
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
            "scene-2": {
              id: "scene-2",
              type: "scene",
              name: "Ending",
              sections: {
                items: {
                  "section-2": {
                    id: "section-2",
                    type: "section",
                    name: "Credits",
                  },
                },
                tree: [{ id: "section-2" }],
              },
            },
          },
          tree: [{ id: "scene-1" }, { id: "scene-2" }],
        },
      },
    );
    setFormValues(
      { state },
      {
        values: {
          sceneId: "scene-2",
        },
      },
    );

    const viewData = selectViewData({ state, props: {} });

    expect(viewData.context.sceneOptions).toEqual([
      { value: "scene-1", label: "Opening" },
      { value: "scene-2", label: "Ending" },
    ]);
    expect(viewData.context.sectionOptions).toEqual([
      { value: "section-2", label: "Credits" },
    ]);
  });
});
