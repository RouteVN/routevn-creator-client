import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  selectSectionTransitionsDAG,
  setRepositoryState,
  setSceneId,
} from "../../src/pages/sceneEditor/sceneEditor.store.js";

describe("sceneEditor.store", () => {
  it("includes conditional branch section targets in the section graph", () => {
    const state = createInitialState();

    setSceneId({ state }, { sceneId: "scene-1" });
    setRepositoryState(
      { state },
      {
        repository: {
          scenes: {
            items: {
              "scene-1": {
                id: "scene-1",
                type: "scene",
                name: "Scene 1",
                sections: {
                  items: {
                    "section-1": {
                      id: "section-1",
                      type: "section",
                      name: "Section 1",
                      lines: {
                        items: {
                          "line-1": {
                            id: "line-1",
                            actions: {
                              conditional: {
                                branches: [
                                  {
                                    when: {
                                      gte: [{ var: "variables.trust" }, 70],
                                    },
                                    actions: {
                                      sectionTransition: {
                                        sceneId: "scene-1",
                                        sectionId: "section-2",
                                      },
                                    },
                                  },
                                  {
                                    actions: {
                                      resetStoryAtSection: {
                                        sectionId: "section-3",
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          },
                        },
                        tree: [{ id: "line-1" }],
                      },
                    },
                    "section-2": {
                      id: "section-2",
                      type: "section",
                      name: "Section 2",
                      lines: {
                        items: {},
                        tree: [],
                      },
                    },
                    "section-3": {
                      id: "section-3",
                      type: "section",
                      name: "Section 3",
                      lines: {
                        items: {},
                        tree: [],
                      },
                    },
                  },
                  tree: [
                    { id: "section-1" },
                    { id: "section-2" },
                    { id: "section-3" },
                  ],
                },
              },
            },
            tree: [{ id: "scene-1" }],
          },
        },
      },
    );

    const graph = selectSectionTransitionsDAG({ state });

    expect(graph.edges).toEqual([
      {
        from: "section-1",
        to: "section-2",
        type: "section",
        lineId: "line-1",
      },
      {
        from: "section-1",
        to: "section-3",
        type: "section",
        lineId: "line-1",
      },
    ]);

    const viewData = selectViewData({ state });
    expect(viewData.sections[0].isDeadEnd).toBe(false);
    expect(viewData.sectionsOverviewItems[0].isDeadEnd).toBe(false);
  });
});
