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
  setSectionLineChangesBySectionId,
  setTemporaryPresentationState,
  showSectionDropdownMenu,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";

describe("sceneEditorLexical.store", () => {
  it("presents text size as a select with full labels", () => {
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
                  items: {},
                  tree: [],
                },
              },
            },
            tree: [{ id: "scene-1" }],
          },
        },
      },
    );

    const viewData = selectViewData({ state });
    const fontSizeField = viewData.sceneSettingsForm.fields.find(
      (field) => field.name === "fontSize",
    );

    expect(fontSizeField).toEqual({
      name: "fontSize",
      type: "select",
      label: "Text size",
      required: true,
      clearable: false,
      options: [
        { value: "xs", label: "Extra Small" },
        { value: "sm", label: "Small" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
        { value: "xl", label: "Extra Large" },
      ],
    });
  });

  it("limits preview canvas width for portrait projects", () => {
    const state = createInitialState();

    setRepositoryState(
      { state },
      {
        repository: {
          project: {
            resolution: {
              width: 1080,
              height: 1920,
            },
          },
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(viewData.canvasAspectRatio).toBe("1080 / 1920");
    expect(viewData.previewCanvasMaxWidth).toBe("min(100%, 28.125vh)");
  });

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
    expect(viewData.sectionEditorItems[0].selectionActive).toBe(true);
    expect(viewData.sectionEditorItems[0].documentEditorLines).toHaveLength(2);
    expect(viewData.sectionEditorItems[0].documentLineDecorations[0]).toEqual(
      expect.objectContaining({ id: "line-1", lineNumber: 1 }),
    );
    expect(viewData.sectionEditorItems[1].selectedLineId).toBe("");
    expect(viewData.sectionEditorItems[1].selectionActive).toBe(false);
    expect(viewData.sectionEditorItems[1].documentEditorLines).toHaveLength(1);
    expect(viewData.sectionEditorItems[1].documentLineDecorations[0]).toEqual(
      expect.objectContaining({ id: "line-3", lineNumber: 1 }),
    );
  });

  it("uses per-section line changes for inactive section decorations", () => {
    const state = createInitialState();
    state.selectedSectionId = "section-1";
    state.selectedLineId = "line-1";

    setSceneId({ state }, { sceneId: "scene-1" });
    setRepositoryState(
      { state },
      {
        repository: {
          characters: {
            items: {
              "character-1": {
                id: "character-1",
                type: "character",
                name: "Aki",
                fileId: "file-character-1",
              },
              "character-2": {
                id: "character-2",
                type: "character",
                name: "Bea",
                fileId: "file-character-2",
              },
            },
            tree: [{ id: "character-1" }, { id: "character-2" }],
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
                      lines: {
                        items: {
                          "line-1": { id: "line-1", actions: {} },
                        },
                        tree: [{ id: "line-1" }],
                      },
                    },
                    "section-2": {
                      id: "section-2",
                      type: "section",
                      name: "Section 2",
                      lines: {
                        items: {
                          "line-2": { id: "line-2", actions: {} },
                        },
                        tree: [{ id: "line-2" }],
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
    setSectionLineChangesBySectionId(
      { state },
      {
        changesBySectionId: {
          "section-1": {
            lines: [
              {
                id: "line-1",
                changes: {},
                presentationState: {
                  dialogue: { characterId: "character-1" },
                },
              },
            ],
          },
          "section-2": {
            lines: [
              {
                id: "line-2",
                changes: {
                  visual: {
                    changeType: "set",
                    data: { items: [] },
                  },
                },
                presentationState: {
                  dialogue: { characterId: "character-2" },
                },
              },
            ],
          },
        },
      },
    );

    const viewData = selectViewData({ state });

    expect(
      viewData.sectionEditorItems[0].documentLineDecorations[0].characterFileId,
    ).toBe("file-character-1");
    expect(
      viewData.sectionEditorItems[1].documentLineDecorations[0].characterFileId,
    ).toBe("file-character-2");
    expect(
      viewData.sectionEditorItems[1].documentLineDecorations[0].visual,
    ).toEqual({ changeType: "set", items: [] });
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
