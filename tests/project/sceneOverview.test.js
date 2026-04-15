import { describe, expect, it } from "vitest";
import { buildSceneOverview } from "../../src/internal/project/sceneOverview.js";

describe("buildSceneOverview", () => {
  it("includes resetStoryAtSection targets in outgoing scene ids", () => {
    const repositoryState = {
      story: {
        initialSceneId: "scene-1",
      },
      layouts: {
        items: {
          "layout-1": {
            id: "layout-1",
            type: "layout",
            elements: {
              items: {
                "element-1": {
                  id: "element-1",
                  click: {
                    payload: {
                      actions: {
                        resetStoryAtSection: {
                          sectionId: "section-2",
                        },
                      },
                    },
                  },
                },
              },
              tree: [{ id: "element-1" }],
            },
          },
        },
        tree: [{ id: "layout-1" }],
      },
      controls: {
        items: {},
        tree: [],
      },
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
                  lines: [
                    {
                      id: "line-1",
                      actions: {
                        resetStoryAtSection: {
                          sectionId: "section-2",
                        },
                      },
                    },
                    {
                      id: "line-2",
                      actions: {
                        background: {
                          resourceId: "layout-1",
                          resourceType: "layout",
                        },
                      },
                    },
                  ],
                },
              },
              tree: [{ id: "section-1" }],
            },
          },
          "scene-2": {
            id: "scene-2",
            type: "scene",
            name: "Scene 2",
            sections: {
              items: {
                "section-2": {
                  id: "section-2",
                  type: "section",
                  name: "Section 2",
                  lines: [],
                },
              },
              tree: [{ id: "section-2" }],
            },
          },
        },
        tree: [{ id: "scene-1" }, { id: "scene-2" }],
      },
    };

    const overview = buildSceneOverview({
      repositoryState,
      sceneId: "scene-1",
    });

    expect(overview.outgoingSceneIds).toEqual(["scene-2"]);
    expect(overview.sections[0].outgoingSceneIds).toEqual(["scene-2"]);
    expect(overview.sections[0].isDeadEnd).toBe(false);
  });
});
