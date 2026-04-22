import { describe, expect, it } from "vitest";
import { resolveLayoutReferences } from "route-engine-js";
import {
  buildFilteredStateForExport,
  collectUsedResourcesForExport,
  constructProjectData,
} from "../../src/internal/project/projection.js";

const createTreeCollection = (items = {}, tree = []) => ({
  items,
  tree,
});

const createExportRepositoryState = (overrides = {}) => ({
  project: {
    resolution: {
      width: 1920,
      height: 1080,
    },
  },
  story: {
    initialSceneId: "scene-1",
  },
  files: createTreeCollection(),
  images: createTreeCollection(),
  spritesheets: createTreeCollection(),
  videos: createTreeCollection(),
  sounds: createTreeCollection(),
  particles: createTreeCollection(),
  animations: createTreeCollection(),
  characters: createTreeCollection(),
  fonts: createTreeCollection(),
  colors: createTreeCollection(),
  textStyles: createTreeCollection(),
  layouts: createTreeCollection(),
  controls: createTreeCollection(),
  transforms: createTreeCollection(),
  variables: createTreeCollection(),
  scenes: createTreeCollection(),
  ...overrides,
});

describe("constructProjectData", () => {
  it("aligns dialogue mode to nvl when the selected ui layout is dialogue-nvl", () => {
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
            layoutType: "dialogue-nvl",
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

  it("keeps text style outline color references in filtered export state", () => {
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
      colors: {
        items: {
          fill: {
            id: "fill",
            type: "color",
            hex: "#ffffff",
          },
          stroke: {
            id: "stroke",
            type: "color",
            hex: "#112233",
          },
        },
        tree: [{ id: "fill" }, { id: "stroke" }],
      },
      fonts: {
        items: {
          "font-1": {
            id: "font-1",
            type: "font",
            fileId: "font-file-1",
          },
        },
        tree: [{ id: "font-1" }],
      },
      textStyles: {
        items: {
          "style-1": {
            id: "style-1",
            type: "textStyle",
            name: "Outlined Text",
            fontId: "font-1",
            colorId: "fill",
            fontSize: 32,
            lineHeight: 1.2,
            strokeColorId: "stroke",
            strokeWidth: 4,
          },
        },
        tree: [{ id: "style-1" }],
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
                "text-1": {
                  id: "text-1",
                  type: "text",
                  name: "Preview Text",
                  x: 10,
                  y: 20,
                  width: 300,
                  height: 80,
                  text: "Hello",
                  textStyleId: "style-1",
                },
              },
              tree: [{ id: "text-1" }],
            },
          },
        },
        tree: [{ id: "layout-main" }],
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

    expect(usage.usedIds.colors).toEqual(
      expect.arrayContaining(["fill", "stroke"]),
    );

    const filteredState = buildFilteredStateForExport(repositoryState, usage);
    const projectData = constructProjectData(filteredState);
    const resolvedElements = resolveLayoutReferences(
      projectData.resources.layouts["layout-main"].elements,
      {
        resources: projectData.resources,
      },
    );

    expect(projectData.resources.colors.stroke).toEqual({
      hex: "#112233",
    });
    expect(resolvedElements[0].textStyle).toEqual(
      expect.objectContaining({
        strokeColor: "#112233",
        strokeWidth: 4,
      }),
    );
  });

  it("drops unreachable scenes and their image assets from export reachability", () => {
    const repositoryState = createExportRepositoryState({
      images: createTreeCollection(
        {
          "image-live": {
            id: "image-live",
            type: "image",
            fileId: "file-live",
            fileType: "image/png",
            fileSize: 111,
          },
          "image-dead": {
            id: "image-dead",
            type: "image",
            fileId: "file-dead",
            fileType: "image/png",
            fileSize: 222,
          },
        },
        [{ id: "image-live" }, { id: "image-dead" }],
      ),
      scenes: createTreeCollection(
        {
          "scene-1": {
            id: "scene-1",
            type: "scene",
            name: "Scene 1",
            initialSectionId: "section-1",
            sections: createTreeCollection(
              {
                "section-1": {
                  id: "section-1",
                  type: "section",
                  name: "Section 1",
                  lines: createTreeCollection(
                    {
                      "line-1": {
                        id: "line-1",
                        actions: {
                          background: {
                            resourceId: "image-live",
                            resourceType: "image",
                          },
                        },
                      },
                    },
                    [{ id: "line-1" }],
                  ),
                },
              },
              [{ id: "section-1" }],
            ),
          },
          "scene-2": {
            id: "scene-2",
            type: "scene",
            name: "Scene 2",
            initialSectionId: "section-2",
            sections: createTreeCollection(
              {
                "section-2": {
                  id: "section-2",
                  type: "section",
                  name: "Section 2",
                  lines: createTreeCollection(
                    {
                      "line-2": {
                        id: "line-2",
                        actions: {
                          background: {
                            resourceId: "image-dead",
                            resourceType: "image",
                          },
                        },
                      },
                    },
                    [{ id: "line-2" }],
                  ),
                },
              },
              [{ id: "section-2" }],
            ),
          },
        },
        [{ id: "scene-1" }, { id: "scene-2" }],
      ),
    });

    const usage = collectUsedResourcesForExport(repositoryState);

    expect(usage.story).toEqual({
      initialSceneId: "scene-1",
      sceneIds: ["scene-1"],
      sectionIds: ["section-1"],
      lineIds: ["line-1"],
    });
    expect(usage.usedIds.images).toEqual(["image-live"]);
    expect(usage.fileIds).toEqual(["file-live"]);

    const filteredState = buildFilteredStateForExport(repositoryState, usage);
    const projectData = constructProjectData(filteredState);

    expect(Object.keys(projectData.story.scenes)).toEqual(["scene-1"]);
    expect(projectData.resources.images).toEqual({
      "image-live": expect.objectContaining({
        fileId: "file-live",
      }),
    });
  });

  it("reaches target scenes through transitions declared inside reachable layouts", () => {
    const repositoryState = createExportRepositoryState({
      images: createTreeCollection(
        {
          "image-target": {
            id: "image-target",
            type: "image",
            fileId: "file-target",
            fileType: "image/png",
            fileSize: 345,
          },
        },
        [{ id: "image-target" }],
      ),
      layouts: createTreeCollection(
        {
          "layout-choice": {
            id: "layout-choice",
            type: "layout",
            name: "Choice Layout",
            layoutType: "normal",
            elements: {
              items: {
                button: {
                  id: "button",
                  type: "button",
                  click: {
                    payload: {
                      actions: {
                        sectionTransition: {
                          sectionId: "section-2",
                        },
                      },
                    },
                  },
                },
              },
              tree: [{ id: "button" }],
            },
          },
        },
        [{ id: "layout-choice" }],
      ),
      scenes: createTreeCollection(
        {
          "scene-1": {
            id: "scene-1",
            type: "scene",
            name: "Scene 1",
            initialSectionId: "section-1",
            sections: createTreeCollection(
              {
                "section-1": {
                  id: "section-1",
                  type: "section",
                  name: "Section 1",
                  lines: createTreeCollection(
                    {
                      "line-1": {
                        id: "line-1",
                        actions: {
                          dialogue: {
                            ui: {
                              resourceId: "layout-choice",
                              resourceType: "layout",
                            },
                          },
                        },
                      },
                    },
                    [{ id: "line-1" }],
                  ),
                },
              },
              [{ id: "section-1" }],
            ),
          },
          "scene-2": {
            id: "scene-2",
            type: "scene",
            name: "Scene 2",
            initialSectionId: "section-2",
            sections: createTreeCollection(
              {
                "section-2": {
                  id: "section-2",
                  type: "section",
                  name: "Section 2",
                  lines: createTreeCollection(
                    {
                      "line-2": {
                        id: "line-2",
                        actions: {
                          background: {
                            resourceId: "image-target",
                            resourceType: "image",
                          },
                        },
                      },
                    },
                    [{ id: "line-2" }],
                  ),
                },
              },
              [{ id: "section-2" }],
            ),
          },
        },
        [{ id: "scene-1" }, { id: "scene-2" }],
      ),
    });

    const usage = collectUsedResourcesForExport(repositoryState);

    expect(usage.story.sceneIds).toEqual(["scene-1", "scene-2"]);
    expect(usage.story.sectionIds).toEqual(["section-1", "section-2"]);
    expect(usage.usedIds.layouts).toEqual(["layout-choice"]);
    expect(usage.usedIds.images).toEqual(["image-target"]);
    expect(usage.fileIds).toEqual(["file-target"]);
  });

  it("drops unreachable sections inside a reachable scene", () => {
    const repositoryState = createExportRepositoryState({
      images: createTreeCollection(
        {
          "image-live": {
            id: "image-live",
            type: "image",
            fileId: "file-live",
            fileType: "image/png",
            fileSize: 111,
          },
          "image-dead": {
            id: "image-dead",
            type: "image",
            fileId: "file-dead",
            fileType: "image/png",
            fileSize: 222,
          },
        },
        [{ id: "image-live" }, { id: "image-dead" }],
      ),
      scenes: createTreeCollection(
        {
          "scene-1": {
            id: "scene-1",
            type: "scene",
            name: "Scene 1",
            initialSectionId: "section-1",
            sections: createTreeCollection(
              {
                "section-1": {
                  id: "section-1",
                  type: "section",
                  name: "Section 1",
                  lines: createTreeCollection(
                    {
                      "line-1": {
                        id: "line-1",
                        actions: {
                          background: {
                            resourceId: "image-live",
                            resourceType: "image",
                          },
                        },
                      },
                    },
                    [{ id: "line-1" }],
                  ),
                },
                "section-2": {
                  id: "section-2",
                  type: "section",
                  name: "Section 2",
                  lines: createTreeCollection(
                    {
                      "line-2": {
                        id: "line-2",
                        actions: {
                          background: {
                            resourceId: "image-dead",
                            resourceType: "image",
                          },
                        },
                      },
                    },
                    [{ id: "line-2" }],
                  ),
                },
              },
              [{ id: "section-1" }, { id: "section-2" }],
            ),
          },
        },
        [{ id: "scene-1" }],
      ),
    });

    const usage = collectUsedResourcesForExport(repositoryState);

    expect(usage.story.sceneIds).toEqual(["scene-1"]);
    expect(usage.story.sectionIds).toEqual(["section-1"]);
    expect(usage.story.lineIds).toEqual(["line-1"]);
    expect(usage.usedIds.images).toEqual(["image-live"]);

    const filteredState = buildFilteredStateForExport(repositoryState, usage);
    const projectData = constructProjectData(filteredState);

    expect(Object.keys(projectData.story.scenes["scene-1"].sections)).toEqual([
      "section-1",
    ]);
  });
});
