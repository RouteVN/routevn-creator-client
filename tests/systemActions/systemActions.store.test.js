import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectActionsData,
  setRepositoryState,
} from "../../src/components/systemActions/systemActions.store.js";

describe("systemActions.store", () => {
  it("builds resetStoryAtSection preview labels from repository sections", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repositoryState: {
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
                      name: "Arrival",
                    },
                  },
                  tree: [{ id: "section-2" }],
                },
              },
            },
            tree: [{ id: "scene-1" }],
          },
        },
      },
    );

    const { actions, preview } = selectActionsData({
      state,
      props: {
        actions: {
          resetStoryAtSection: {
            sectionId: "section-2",
          },
        },
      },
    });

    expect(actions.resetStoryAtSection).toEqual({
      sectionId: "section-2",
    });
    expect(preview.resetStoryAtSection).toMatchObject({
      sectionId: "section-2",
      label: "Reset story at Opening - Arrival",
    });
  });
});
