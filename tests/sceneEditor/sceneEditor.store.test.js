import { describe, expect, it } from "vitest";
import {
  createInitialState,
  clearTemporaryPresentationState,
  selectEffectivePresentationState,
  selectViewData,
  selectSectionTransitionsDAG,
  setRepositoryState,
  setSceneId,
  setPresentationState,
  setTemporaryPresentationState,
  showSectionDropdownMenu,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";

describe("sceneEditorLexical.store", () => {
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

  it("overlays temporary presentation state over committed presentation state", () => {
    const state = createInitialState();

    setPresentationState(
      { state },
      {
        presentationState: {
          dialogue: {
            mode: "adv",
          },
          background: {
            resourceId: "background-1",
          },
        },
      },
    );
    setTemporaryPresentationState(
      { state },
      {
        presentationState: {
          dialogue: {
            mode: "nvl",
          },
        },
      },
    );

    expect(selectEffectivePresentationState({ state })).toEqual({
      dialogue: {
        mode: "nvl",
      },
      background: {
        resourceId: "background-1",
      },
    });
    expect(selectViewData({ state }).presentationState.dialogue).toEqual({
      mode: "nvl",
    });

    clearTemporaryPresentationState({ state });

    expect(selectEffectivePresentationState({ state }).dialogue).toEqual({
      mode: "adv",
    });
  });

  it("hides move scene for the last section in the current scene", () => {
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
                        items: {},
                        tree: [],
                      },
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
                  items: {},
                  tree: [],
                },
              },
            },
            tree: [{ id: "scene-1" }, { id: "scene-2" }],
          },
        },
      },
    );

    showSectionDropdownMenu(
      { state },
      {
        sectionId: "section-1",
        position: { x: 0, y: 0 },
      },
    );

    const itemValues = state.dropdownMenu.items.map((item) => item.value);
    expect(itemValues).toContain("duplicate-section");
    expect(itemValues).not.toContain("move-section-scene");
  });

  it("builds one document editor item per section with local line numbers", () => {
    const state = createInitialState();
    state.selectedSectionId = "section-1";
    state.selectedLineId = "line-1";

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
                          "line-1": { id: "line-1", actions: {} },
                          "line-2": { id: "line-2", actions: {} },
                        },
                        tree: [{ id: "line-1" }, { id: "line-2" }],
                      },
                    },
                    "section-2": {
                      id: "section-2",
                      type: "section",
                      name: "Section 2",
                      lines: {
                        items: {
                          "line-3": { id: "line-3", actions: {} },
                        },
                        tree: [{ id: "line-3" }],
                      },
                    },
                  },
                  tree: [{ id: "section-1" }, { id: "section-2" }],
                },
              },
            },
            tree: [{ id: "scene-1" }],
          },
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.sectionEditorItems).toHaveLength(2);
    expect(viewData.sectionEditorItems[0].selectedLineId).toBe("line-1");
    expect(viewData.sectionEditorItems[0].documentEditorLines).toHaveLength(2);
    expect(viewData.sectionEditorItems[0].documentLineDecorations[0]).toEqual(
      expect.objectContaining({ id: "line-1", lineNumber: 1 }),
    );
    expect(viewData.sectionEditorItems[1].selectedLineId).toBeUndefined();
    expect(viewData.sectionEditorItems[1].documentEditorLines).toHaveLength(1);
    expect(viewData.sectionEditorItems[1].documentLineDecorations[0]).toEqual(
      expect.objectContaining({ id: "line-3", lineNumber: 1 }),
    );
  });

  it("builds section menu actions for add, reorder, and moving to another scene", () => {
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
                      lines: { items: {}, tree: [] },
                    },
                    "section-2": {
                      id: "section-2",
                      type: "section",
                      name: "Section 2",
                      lines: { items: {}, tree: [] },
                    },
                  },
                  tree: [{ id: "section-1" }, { id: "section-2" }],
                },
              },
              "scene-2": {
                id: "scene-2",
                type: "scene",
                name: "Scene 2",
                sections: { items: {}, tree: [] },
              },
            },
            tree: [{ id: "scene-1" }, { id: "scene-2" }],
          },
        },
      },
    );

    showSectionDropdownMenu(
      { state },
      {
        sectionId: "section-1",
        position: { x: 0, y: 0 },
      },
    );

    expect(state.dropdownMenu.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Add section above",
          value: "add-section-above",
        }),
        expect.objectContaining({
          label: "Add section below",
          value: "add-section-below",
        }),
        expect.objectContaining({
          label: "Move down",
          value: "move-section-down",
        }),
        expect.objectContaining({
          label: "Move to scene",
          value: "move-section-scene",
        }),
      ]),
    );
    expect(state.dropdownMenu.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "move-section-up" }),
      ]),
    );
    expect(state.dropdownMenu.items.some((item) => item.disabled)).toBe(false);
  });
});
