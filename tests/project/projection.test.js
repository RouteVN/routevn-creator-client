import { describe, expect, it } from "vitest";
import {
  buildFilteredStateForExport,
  collectUsedResourcesForExport,
  constructProjectData,
} from "../../src/internal/project/projection.js";

describe("constructProjectData", () => {
  it("aligns dialogue mode to nvl when the selected ui layout is nvl", () => {
    const projectData = constructProjectData({
      project: {
        resolution: {
          width: 1920,
          height: 1080,
        },
      },
      story: {
        initialSceneId: "scene-1",
      },
      layouts: {
        items: {
          "layout-nvl": {
            id: "layout-nvl",
            type: "layout",
            name: "NVL Layout",
            layoutType: "nvl",
            elements: {
              items: {},
              tree: [],
            },
          },
        },
        tree: [{ id: "layout-nvl" }],
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
                  name: "Section 1",
                  lines: {
                    items: {
                      "line-1": {
                        id: "line-1",
                        actions: {
                          dialogue: {
                            mode: "adv",
                            ui: {
                              resourceId: "layout-nvl",
                            },
                          },
                        },
                      },
                    },
                    tree: [{ id: "line-1" }],
                  },
                },
              },
              tree: [{ id: "section-1" }],
            },
          },
        },
        tree: [{ id: "scene-1" }],
      },
    });

    expect(
      projectData.story.scenes["scene-1"].sections["section-1"].lines[0].actions
        .dialogue.mode,
    ).toBe("nvl");
  });

  it("keeps fragment layouts in filtered export state and expands them", () => {
    const repositoryState = {
      project: {
        resolution: {
          width: 1920,
          height: 1080,
        },
      },
      story: {
        initialSceneId: "scene-1",
      },
      layouts: {
        items: {
          "layout-main": {
            id: "layout-main",
            type: "layout",
            name: "Main Layout",
            layoutType: "normal",
            elements: {
              items: {
                "fragment-ref-1": {
                  id: "fragment-ref-1",
                  type: "fragment-ref",
                  name: "Fragment Ref",
                  x: 0,
                  y: 0,
                  width: 100,
                  height: 100,
                  fragmentLayoutId: "layout-fragment",
                },
              },
              tree: [{ id: "fragment-ref-1" }],
            },
          },
          "layout-fragment": {
            id: "layout-fragment",
            type: "layout",
            name: "Fragment Layout",
            layoutType: "normal",
            isFragment: true,
            elements: {
              items: {
                "fragment-text": {
                  id: "fragment-text",
                  type: "text",
                  name: "Fragment Text",
                  x: 4,
                  y: 8,
                  width: 120,
                  height: 24,
                  text: "Hello from fragment",
                },
              },
              tree: [{ id: "fragment-text" }],
            },
          },
        },
        tree: [{ id: "layout-main" }, { id: "layout-fragment" }],
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
                  name: "Section 1",
                  lines: {
                    items: {
                      "line-1": {
                        id: "line-1",
                        actions: {
                          dialogue: {
                            ui: {
                              resourceId: "layout-main",
                            },
                          },
                        },
                      },
                    },
                    tree: [{ id: "line-1" }],
                  },
                },
              },
              tree: [{ id: "section-1" }],
            },
          },
        },
        tree: [{ id: "scene-1" }],
      },
    };

    const usage = collectUsedResourcesForExport(repositoryState);

    expect(usage.usedIds.layouts).toEqual(
      expect.arrayContaining(["layout-main", "layout-fragment"]),
    );

    const filteredState = buildFilteredStateForExport(repositoryState, usage);
    const projectData = constructProjectData(filteredState);
    const fragmentRef =
      projectData.resources.layouts["layout-main"].elements[0];

    expect(fragmentRef.children).toEqual([
      expect.objectContaining({
        id: "fragment-ref-1--fragment-text",
        type: "text",
        text: "Hello from fragment",
      }),
    ]);
  });
});
