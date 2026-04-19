import { describe, expect, it, vi } from "vitest";
import { constructProjectData } from "../../src/internal/project/projection.js";
import {
  collectPreviewMissingTargets,
  collectSceneIdsFromValue,
  collectSectionIdsFromValue,
  ensurePreviewProjectDataTargets,
  hasPreviewSceneEntryLines,
  hasPreviewSceneLines,
  hasPreviewSectionLines,
  withPreviewEntryPoint,
} from "../../src/components/vnPreview/support/vnPreviewProjectData.js";

const createRepositoryState = ({ sceneIds }) => ({
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
    items: {},
    tree: [],
  },
  controls: {
    items: {},
    tree: [],
  },
  scenes: {
    items: Object.fromEntries(
      sceneIds.map((sceneId, index) => {
        const sectionId = `${sceneId}-section-1`;
        const lineId = `${sceneId}-line-1`;

        return [
          sceneId,
          {
            id: sceneId,
            type: "scene",
            name: `Scene ${index + 1}`,
            sections: {
              items: {
                [sectionId]: {
                  id: sectionId,
                  name: `Section ${index + 1}`,
                  lines: {
                    items: {
                      [lineId]: {
                        id: lineId,
                        actions: {},
                      },
                    },
                    tree: [{ id: lineId }],
                  },
                },
              },
              tree: [{ id: sectionId }],
            },
          },
        ];
      }),
    ),
    tree: sceneIds.map((sceneId) => ({ id: sceneId })),
  },
});

describe("vnPreview project data helpers", () => {
  it("collects target scene ids from nested fullscreen preview actions", () => {
    const sceneIds = collectSceneIdsFromValue(
      {
        sectionTransition: {
          sceneId: "scene-2",
          sectionId: "section-2",
        },
      },
      {
        payload: {
          actions: {
            choice: {
              items: [
                {
                  events: {
                    click: {
                      actions: {
                        sectionTransition: {
                          sceneId: "scene-3",
                          sectionId: "section-3",
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    );

    expect(sceneIds).toEqual(["scene-2", "scene-3"]);
  });

  it("collects target section ids from nested fullscreen preview actions", () => {
    const sectionIds = collectSectionIdsFromValue(
      {
        sectionTransition: {
          sectionId: "section-2",
        },
      },
      {
        payload: {
          actions: {
            choice: {
              items: [
                {
                  events: {
                    click: {
                      actions: {
                        sectionTransition: {
                          sectionId: "section-3",
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    );

    expect(sectionIds).toEqual(["section-2", "section-3"]);
  });

  it("detects whether preview scenes and sections already have loaded lines", () => {
    const initialState = createRepositoryState({
      sceneIds: ["scene-1", "scene-2"],
    });
    initialState.scenes.items["scene-2"].sections.items[
      "scene-2-section-1"
    ].lines = {
      items: {},
      tree: [],
    };
    const projectData = constructProjectData(initialState, {
      initialSceneId: "scene-1",
    });

    expect(hasPreviewSceneLines(projectData, "scene-1")).toBe(true);
    expect(hasPreviewSceneEntryLines(projectData, "scene-1")).toBe(true);
    expect(hasPreviewSectionLines(projectData, "scene-1-section-1")).toBe(true);
    expect(hasPreviewSceneLines(projectData, "scene-2")).toBe(false);
    expect(hasPreviewSceneEntryLines(projectData, "scene-2")).toBe(false);
    expect(hasPreviewSectionLines(projectData, "scene-2-section-1")).toBe(
      false,
    );
  });

  it("treats a target scene as missing when only non-entry sections still have lines", () => {
    const initialState = createRepositoryState({
      sceneIds: ["scene-1", "scene-2"],
    });
    initialState.scenes.items["scene-2"].sections.items[
      "scene-2-section-1"
    ].lines = {
      items: {},
      tree: [],
    };
    initialState.scenes.items["scene-2"].sections.items[
      "scene-2-section-2"
    ] = {
      id: "scene-2-section-2",
      name: "Section 2",
      lines: {
        items: {
          "scene-2-line-2": {
            id: "scene-2-line-2",
            actions: {},
          },
        },
        tree: [{ id: "scene-2-line-2" }],
      },
    };
    initialState.scenes.items["scene-2"].sections.tree = [
      { id: "scene-2-section-1" },
      { id: "scene-2-section-2" },
    ];
    const projectData = constructProjectData(initialState, {
      initialSceneId: "scene-1",
    });

    expect(hasPreviewSceneLines(projectData, "scene-2")).toBe(true);
    expect(hasPreviewSceneEntryLines(projectData, "scene-2")).toBe(false);

    const result = collectPreviewMissingTargets({
      projectData,
      loadedSceneIds: ["scene-1", "scene-2"],
      sceneIds: ["scene-2"],
    });

    expect(result).toEqual({
      missingSceneIds: ["scene-2"],
      missingSectionIds: [],
    });
  });

  it("treats stripped target sections as missing even when the scene id is already known", () => {
    const initialState = createRepositoryState({
      sceneIds: ["scene-1", "scene-2"],
    });
    initialState.scenes.items["scene-2"].sections.items[
      "scene-2-section-1"
    ].lines = {
      items: {},
      tree: [],
    };
    const projectData = constructProjectData(initialState, {
      initialSceneId: "scene-1",
    });

    const result = collectPreviewMissingTargets({
      projectData,
      loadedSceneIds: ["scene-1", "scene-2"],
      sectionIds: ["scene-2-section-1"],
    });

    expect(result).toEqual({
      missingSceneIds: ["scene-2"],
      missingSectionIds: ["scene-2-section-1"],
    });
  });

  it("hydrates missing targets and preserves the preview entry point", async () => {
    const initialSceneId = "scene-1";
    const initialSectionId = "scene-1-section-1";
    const initialLineId = "scene-1-line-1";
    const initialState = createRepositoryState({
      sceneIds: [initialSceneId, "scene-2"],
    });
    initialState.scenes.items["scene-2"].sections.items[
      "scene-2-section-1"
    ].lines = {
      items: {},
      tree: [],
    };
    const hydratedState = createRepositoryState({
      sceneIds: [initialSceneId, "scene-2"],
    });
    const repository = {
      getContextState: vi.fn().mockResolvedValue(hydratedState),
    };
    const projectData = withPreviewEntryPoint(
      constructProjectData(initialState, {
        initialSceneId,
      }),
      {
        sceneId: initialSceneId,
        sectionId: initialSectionId,
        lineId: initialLineId,
      },
    );

    const result = await ensurePreviewProjectDataTargets({
      repository,
      projectData,
      loadedSceneIds: [initialSceneId],
      sceneIds: ["scene-2"],
      sectionIds: ["scene-2-section-1"],
      initialSceneId,
      initialSectionId,
      initialLineId,
    });

    expect(repository.getContextState).toHaveBeenCalledWith({
      sceneIds: [initialSceneId, "scene-2"],
      sectionIds: ["scene-2-section-1"],
    });
    expect(result.didLoad).toBe(true);
    expect(result.missingSceneIds).toEqual(["scene-2"]);
    expect(result.missingSectionIds).toEqual(["scene-2-section-1"]);
    expect(result.loadedSceneIds).toEqual([initialSceneId, "scene-2"]);
    expect(result.projectData.story.initialSceneId).toBe(initialSceneId);
    expect(result.projectData.story.scenes["scene-2"]).toBeDefined();
    expect(
      result.projectData.story.scenes[initialSceneId].initialSectionId,
    ).toBe(initialSectionId);
    expect(
      result.projectData.story.scenes[initialSceneId].sections[initialSectionId]
        .initialLineId,
    ).toBe(initialLineId);
  });

  it("rehydrates a known scene id when the cached preview scene has no lines", async () => {
    const initialSceneId = "scene-1";
    const initialState = createRepositoryState({
      sceneIds: [initialSceneId, "scene-2"],
    });
    initialState.scenes.items["scene-2"].sections.items[
      "scene-2-section-1"
    ].lines = {
      items: {},
      tree: [],
    };
    const hydratedState = createRepositoryState({
      sceneIds: [initialSceneId, "scene-2"],
    });
    const repository = {
      getContextState: vi.fn().mockResolvedValue(hydratedState),
    };
    const projectData = withPreviewEntryPoint(
      constructProjectData(initialState, {
        initialSceneId,
      }),
      {
        sceneId: initialSceneId,
      },
    );

    const result = await ensurePreviewProjectDataTargets({
      repository,
      projectData,
      loadedSceneIds: [initialSceneId, "scene-2"],
      sceneIds: ["scene-2"],
      sectionIds: [],
      initialSceneId,
    });

    expect(repository.getContextState).toHaveBeenCalledWith({
      sceneIds: [initialSceneId, "scene-2"],
      sectionIds: [],
    });
    expect(result.didLoad).toBe(true);
    expect(result.missingSceneIds).toEqual(["scene-2"]);
    expect(result.projectData.story.scenes["scene-2"]).toBeDefined();
    expect(hasPreviewSceneLines(result.projectData, "scene-2")).toBe(true);
  });

  it("rehydrates a known scene id when its cached entry section has no lines", async () => {
    const initialSceneId = "scene-1";
    const initialState = createRepositoryState({
      sceneIds: [initialSceneId, "scene-2"],
    });
    initialState.scenes.items["scene-2"].sections.items[
      "scene-2-section-1"
    ].lines = {
      items: {},
      tree: [],
    };
    initialState.scenes.items["scene-2"].sections.items[
      "scene-2-section-2"
    ] = {
      id: "scene-2-section-2",
      name: "Section 2",
      lines: {
        items: {
          "scene-2-line-2": {
            id: "scene-2-line-2",
            actions: {},
          },
        },
        tree: [{ id: "scene-2-line-2" }],
      },
    };
    initialState.scenes.items["scene-2"].sections.tree = [
      { id: "scene-2-section-1" },
      { id: "scene-2-section-2" },
    ];
    const hydratedState = createRepositoryState({
      sceneIds: [initialSceneId, "scene-2"],
    });
    const repository = {
      getContextState: vi.fn().mockResolvedValue(hydratedState),
    };
    const projectData = withPreviewEntryPoint(
      constructProjectData(initialState, {
        initialSceneId,
      }),
      {
        sceneId: initialSceneId,
      },
    );

    const result = await ensurePreviewProjectDataTargets({
      repository,
      projectData,
      loadedSceneIds: [initialSceneId, "scene-2"],
      sceneIds: ["scene-2"],
      sectionIds: [],
      initialSceneId,
    });

    expect(repository.getContextState).toHaveBeenCalledWith({
      sceneIds: [initialSceneId, "scene-2"],
      sectionIds: [],
    });
    expect(result.didLoad).toBe(true);
    expect(result.missingSceneIds).toEqual(["scene-2"]);
    expect(hasPreviewSceneEntryLines(result.projectData, "scene-2")).toBe(
      true,
    );
  });
});
