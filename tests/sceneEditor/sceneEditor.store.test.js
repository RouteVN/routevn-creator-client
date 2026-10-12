import { describe, expect, it } from "vitest";
import {
  cancelBackgroundTransformEditorDrag,
  createInitialState,
  clearBackgroundTransformEditorPreviewTransform,
  clearTemporaryPresentationState,
  closeBackgroundTransformEditor,
  openBackgroundTransformEditor,
  refreshSceneTextStats,
  resetBackgroundTransformEditorDrag,
  selectBackgroundTransformEditor,
  selectCanvasBackgroundTransformEditor,
  selectEffectivePresentationState,
  selectHasBackgroundTransformEditorPreviewTransform,
  selectPreviousPresentationState,
  selectViewData,
  selectSectionTransitionsDAG,
  setRepositoryState,
  setSceneId,
  setSceneLoadingProgress,
  setSceneLoadingDetailsVisible,
  setScenePageLoading,
  setPresentationState,
  setMobileKeyboardState,
  setUiConfig,
  setBackgroundTransformEditorDragStartPosition,
  setBackgroundTransformEditorPreviewTransform,
  setBackgroundTransformEditorSelectedElementMetrics,
  setBackgroundTransformEditorTransform,
  setProjectLanguage,
  setSelectedLineId,
  setSelectedSectionId,
  setSectionLineChangesBySectionId,
  setTemporaryPresentationState,
  showAddSectionDropdownMenu,
  showSectionDropdownMenu,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("sceneEditorLexical.store", () => {
  it("shows the loading stage and asset name separately, then clears stale details for another scene", () => {
    const state = createInitialState();
    setSceneLoadingProgress(
      { state },
      {
        stage: "reading",
        completed: 2,
        total: 5,
        assetName: "Images: Image One",
      },
    );
    setSceneLoadingDetailsVisible({ state }, { visible: true });
    let view = selectViewData({ state, i18n: EN_I18N });
    expect(view.loadingSceneLabel).toBe("Checking assets: 2 / 5");
    expect(view.loadingAssetsLabel).toBe(view.loadingSceneLabel);
    expect(view.loadingAssetName).toBe("Images: Image One");
    setScenePageLoading({ state }, { isLoading: true });
    view = selectViewData({ state, i18n: EN_I18N });
    expect(view.loadingSceneLabel).toBe("Preparing scenes...");
    expect(view.loadingAssetName).toBeUndefined();
  });

  it.each([
    ["hidden", { isVisible: false }, "48px"],
    ["overlay", { isVisible: true, keyboardInset: 380, bottom: 380 }, "428px"],
    [
      "panned",
      {
        isVisible: true,
        keyboardInset: 380,
        bottom: 200,
        visualOffsetTop: 180,
      },
      "248px",
    ],
    ["resized", { isVisible: true, keyboardInset: 380, bottom: 0 }, "48px"],
  ])(
    "keeps only obscured keyboard and toolbar clearance when %s",
    (_name, metrics, expected) => {
      const state = createInitialState();
      setUiConfig({ state }, { uiConfig: { id: "touch" } });
      setMobileKeyboardState({ state }, { visualHeight: 464, ...metrics });

      expect(
        selectViewData({ state, i18n: EN_I18N }).mobileEditorBottomSpacerHeight,
      ).toBe(expected);
    },
  );

  it("pins the mobile scene canvas and its actions panel to the panned visual viewport", () => {
    const state = createInitialState();
    setUiConfig({ state }, { uiConfig: { id: "touch" } });
    setMobileKeyboardState(
      { state },
      { isVisible: true, visualHeight: 440, visualOffsetTop: 180 },
    );

    const view = selectViewData({ state, i18n: EN_I18N });
    expect(view.mobileSceneEditorTopInset).toBe("180px");
    expect(view.mobileSystemActionsDialogTop).toBe(
      "calc(180px + var(--rvn-mobile-overlay-top-inset, 0px) + min(56.25dvw, max(72px, calc(376px - var(--rvn-mobile-overlay-top-inset, 0px)))))",
    );
    expect(view.mobileSceneEditorBottomInset).toBe("0px");
  });

  it("keeps Android overlay keyboard positioning at the top with no viewport pan", () => {
    const state = createInitialState();
    setUiConfig({ state }, { uiConfig: { id: "touch" } });
    setMobileKeyboardState(
      { state },
      { isVisible: true, visualHeight: 440, visualOffsetTop: 0 },
    );

    const view = selectViewData({ state, i18n: EN_I18N });
    expect(view.mobileSceneEditorTopInset).toBe("0px");
    expect(view.mobileSystemActionsDialogTop).toBe(
      "calc(0px + var(--rvn-mobile-overlay-top-inset, 0px) + min(56.25dvw, max(72px, calc(376px - var(--rvn-mobile-overlay-top-inset, 0px)))))",
    );
  });

  it("tracks the visual viewport until keyboard dismissal has finished", () => {
    const state = createInitialState();
    setUiConfig({ state }, { uiConfig: { id: "touch" } });
    setMobileKeyboardState(
      { state },
      { isVisible: false, visualOffsetTop: 80 },
    );
    expect(
      selectViewData({ state, i18n: EN_I18N }).mobileSceneEditorTopInset,
    ).toBe("80px");

    setMobileKeyboardState({ state }, { isVisible: false, visualOffsetTop: 0 });
    const view = selectViewData({ state, i18n: EN_I18N });
    expect(view.mobileSceneEditorTopInset).toBe("0px");
    expect(view.mobileSceneEditorBottomInset).toBe(
      "calc(64px + env(safe-area-inset-bottom))",
    );
  });

  it("positions the mobile actions dialog below the preview using dynamic viewport width", () => {
    const state = createInitialState();
    setUiConfig({ state }, { uiConfig: { id: "touch" } });

    expect(
      selectViewData({ state, i18n: EN_I18N }).mobileSystemActionsDialogTop,
    ).toBe(
      "calc(0px + var(--rvn-mobile-overlay-top-inset, 0px) + min(56.25dvw, 50vh))",
    );

    setMobileKeyboardState(
      { state },
      {
        isVisible: true,
        visualHeight: 500,
      },
    );

    expect(
      selectViewData({ state, i18n: EN_I18N }).mobileSystemActionsDialogTop,
    ).toBe(
      "calc(0px + var(--rvn-mobile-overlay-top-inset, 0px) + min(56.25dvw, max(72px, calc(436px - var(--rvn-mobile-overlay-top-inset, 0px)))))",
    );
  });

  it("resolves the transform origin when rendered target metrics arrive", () => {
    const state = createInitialState();

    openBackgroundTransformEditor(
      { state },
      {
        targetType: "character",
        transform: {
          anchorX: 0.5,
          anchorY: 1,
          originX: 0,
          originY: 0,
        },
      },
    );
    setBackgroundTransformEditorSelectedElementMetrics(
      { state },
      {
        metrics: {
          width: 400,
          height: 600,
        },
      },
    );

    expect(state.backgroundTransformEditor.transform).toMatchObject({
      anchorX: 0.5,
      anchorY: 1,
      originX: 200,
      originY: 600,
    });
  });

  describe("transform editor inspector preview", () => {
    const openEditor = (state) =>
      openBackgroundTransformEditor(
        { state },
        {
          targetType: "background",
          background: { resourceId: "image-one" },
          transform: { x: 100, y: 120 },
        },
      );

    it("draws a previewed transform on the canvas and keeps the committed one", () => {
      const state = createInitialState();
      openEditor(state);
      const committed = state.backgroundTransformEditor.transform;

      expect(state.backgroundTransformEditor.previewTransform).toBeUndefined();
      expect(
        selectHasBackgroundTransformEditorPreviewTransform({ state }),
      ).toBe(false);
      // Without a preview the canvas draws the editor as it is.
      expect(selectCanvasBackgroundTransformEditor({ state })).toBe(
        state.backgroundTransformEditor,
      );

      setBackgroundTransformEditorPreviewTransform(
        { state },
        { transform: { x: 300, y: 220, scaleX: 2 } },
      );

      expect(
        selectHasBackgroundTransformEditorPreviewTransform({ state }),
      ).toBe(true);
      expect(selectCanvasBackgroundTransformEditor({ state })).toMatchObject({
        isOpen: true,
        targetType: "background",
        background: { resourceId: "image-one" },
        transform: {
          x: 300,
          y: 220,
          scaleX: 2,
          scaleY: 1,
          anchorX: 0.5,
          anchorY: 0.5,
        },
      });
      // Everything but the canvas reads the committed transform.
      expect(committed).toMatchObject({ x: 100, y: 120 });
      expect(state.backgroundTransformEditor.transform).toEqual(committed);
      expect(selectBackgroundTransformEditor({ state }).transform).toEqual(
        committed,
      );
    });

    it("replaces a previewed transform when the transform changes", () => {
      const state = createInitialState();
      openEditor(state);
      setBackgroundTransformEditorPreviewTransform(
        { state },
        { transform: { x: 300 } },
      );

      setBackgroundTransformEditorTransform(
        { state },
        { transform: { x: 400, y: 50 } },
      );

      expect(
        selectHasBackgroundTransformEditorPreviewTransform({ state }),
      ).toBe(false);
      expect(state.backgroundTransformEditor.previewTransform).toBeUndefined();
      expect(state.backgroundTransformEditor.transform).toMatchObject({
        x: 400,
        y: 50,
      });
      expect(selectCanvasBackgroundTransformEditor({ state })).toBe(
        state.backgroundTransformEditor,
      );
    });

    it("puts the committed transform back on the canvas when the preview is cleared", () => {
      const state = createInitialState();
      openEditor(state);
      setBackgroundTransformEditorPreviewTransform(
        { state },
        { transform: { x: 300 } },
      );

      clearBackgroundTransformEditorPreviewTransform({ state });

      expect(
        selectHasBackgroundTransformEditorPreviewTransform({ state }),
      ).toBe(false);
      expect(state.backgroundTransformEditor.previewTransform).toBeUndefined();
      expect(state.backgroundTransformEditor.transform).toMatchObject({
        x: 100,
        y: 120,
      });
      expect(selectCanvasBackgroundTransformEditor({ state })).toBe(
        state.backgroundTransformEditor,
      );
    });

    it("drops a previewed transform when the editor opens again", () => {
      const state = createInitialState();
      openEditor(state);
      setBackgroundTransformEditorPreviewTransform(
        { state },
        { transform: { x: 300 } },
      );

      openBackgroundTransformEditor(
        { state },
        { targetType: "visual", transform: { x: 10 } },
      );

      expect(
        selectHasBackgroundTransformEditorPreviewTransform({ state }),
      ).toBe(false);
      expect(selectCanvasBackgroundTransformEditor({ state })).toMatchObject({
        targetType: "visual",
        transform: { x: 10 },
      });
    });

    it("drops a previewed transform when the editor closes", () => {
      const state = createInitialState();
      openEditor(state);
      setBackgroundTransformEditorPreviewTransform(
        { state },
        { transform: { x: 300 } },
      );

      closeBackgroundTransformEditor({ state });

      expect(state.backgroundTransformEditor.isOpen).toBe(false);
      expect(
        selectHasBackgroundTransformEditorPreviewTransform({ state }),
      ).toBe(false);
      expect(state.backgroundTransformEditor.previewTransform).toBeUndefined();
    });

    it("keeps a previewed transform when rendered target metrics arrive", () => {
      const state = createInitialState();
      openBackgroundTransformEditor(
        { state },
        {
          targetType: "character",
          transform: { anchorX: 0.5, anchorY: 1 },
        },
      );
      setBackgroundTransformEditorPreviewTransform(
        { state },
        { transform: { x: 300, anchorX: 0.5, anchorY: 1 } },
      );
      const metrics = { width: 400, height: 600 };

      setBackgroundTransformEditorSelectedElementMetrics(
        { state },
        { metrics },
      );

      expect(state.backgroundTransformEditor.selectedElementMetrics).toEqual(
        metrics,
      );
      expect(
        selectHasBackgroundTransformEditorPreviewTransform({ state }),
      ).toBe(true);
      expect(
        selectCanvasBackgroundTransformEditor({ state }).transform,
      ).toMatchObject({
        x: 300,
      });
      // The committed transform still takes its origin from the metrics.
      expect(state.backgroundTransformEditor.transform).toMatchObject({
        originX: 200,
        originY: 600,
      });
    });
  });

  describe("transform editor canvas drag", () => {
    const openEditor = (state) =>
      openBackgroundTransformEditor(
        { state },
        {
          targetType: "background",
          background: { resourceId: "image-one" },
          transform: {
            x: 100,
            y: 120,
            rotation: 15,
            anchorX: 0.25,
            anchorY: 0.75,
          },
        },
      );

    // A drag that began with the target at 100, 120 and has moved and scaled
    // it since.
    const dragTarget = (state) => {
      setBackgroundTransformEditorDragStartPosition(
        { state },
        {
          dragStartPosition: {
            x: 500,
            y: 400,
            transformStartX: 100,
            transformStartY: 120,
            transformStartScaleX: 1,
            transformStartScaleY: 1,
          },
        },
      );
      setBackgroundTransformEditorTransform(
        { state },
        {
          transform: {
            ...state.backgroundTransformEditor.transform,
            x: 460,
            y: 300,
            scaleX: 2,
            scaleY: 2,
          },
        },
      );
    };

    it("starts with no cancelled drag", () => {
      const state = createInitialState();

      expect(state.backgroundTransformEditor.isDragCancelled).toBe(false);
    });

    it("puts the target back where the drag found it when its pointer is cancelled", () => {
      const state = createInitialState();
      openEditor(state);
      dragTarget(state);

      cancelBackgroundTransformEditorDrag({ state });

      expect(state.backgroundTransformEditor.transform).toMatchObject({
        x: 100,
        y: 120,
        scaleX: 1,
        scaleY: 1,
      });
      // Only what a drag moves goes back.
      expect(state.backgroundTransformEditor.transform).toMatchObject({
        rotation: 15,
        anchorX: 0.25,
        anchorY: 0.75,
      });
      // The moves the pointer still sends move nothing, until it lifts.
      expect(state.backgroundTransformEditor.dragStartPosition).toBeUndefined();
      expect(state.backgroundTransformEditor.isDragCancelled).toBe(true);
    });

    it("drops a cancelled pointer's drag even when it had not moved the target yet", () => {
      const state = createInitialState();
      openEditor(state);
      const transform = { ...state.backgroundTransformEditor.transform };

      cancelBackgroundTransformEditorDrag({ state });

      expect(state.backgroundTransformEditor.transform).toEqual(transform);
      expect(state.backgroundTransformEditor.isDragCancelled).toBe(true);
    });

    it("ends a drag where it stopped, so the next one starts from there", () => {
      const state = createInitialState();
      openEditor(state);
      dragTarget(state);

      resetBackgroundTransformEditorDrag({ state });

      expect(state.backgroundTransformEditor.dragStartPosition).toBeUndefined();
      expect(state.backgroundTransformEditor.transform).toMatchObject({
        x: 460,
        y: 300,
        scaleX: 2,
        scaleY: 2,
      });
    });

    it("lets the next drag move the target once the cancelled pointer's drag is over", () => {
      const state = createInitialState();
      openEditor(state);
      dragTarget(state);
      cancelBackgroundTransformEditorDrag({ state });
      expect(state.backgroundTransformEditor.isDragCancelled).toBe(true);

      resetBackgroundTransformEditorDrag({ state });

      expect(state.backgroundTransformEditor.isDragCancelled).toBe(false);
      expect(state.backgroundTransformEditor.dragStartPosition).toBeUndefined();
    });

    it.each([
      ["opens again", (state) => openEditor(state)],
      ["closes", (state) => closeBackgroundTransformEditor({ state })],
    ])("forgets a cancelled drag when the editor %s", (_name, act) => {
      const state = createInitialState();
      openEditor(state);
      dragTarget(state);
      cancelBackgroundTransformEditorDrag({ state });

      act(state);

      expect(state.backgroundTransformEditor.isDragCancelled).toBe(false);
      expect(state.backgroundTransformEditor.dragStartPosition).toBeUndefined();
    });
  });

  it("shows a localized add-section menu for empty editor space", () => {
    const state = createInitialState();

    showAddSectionDropdownMenu({ state }, { position: { x: 120, y: 240 } });

    expect(state.dropdownMenu).toMatchObject({
      isOpen: true,
      position: { x: 120, y: 240 },
      sectionId: null,
      items: [{ label: "Add section", type: "item", value: "add-section" }],
    });
    expect(
      selectViewData({ state, i18n: EN_I18N }).dropdownMenu.items[0].label,
    ).toBe("Add section");
  });

  it("uses the project language to select the scene text count mode", () => {
    const state = createInitialState();
    setProjectLanguage({ state }, { language: "zh-Hans" });
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
                      lines: {
                        items: {
                          "line-1": {
                            id: "line-1",
                            actions: {
                              dialogue: {
                                content: [{ text: "你好，世界！" }],
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
        },
      },
    );
    refreshSceneTextStats({ state });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.sceneTextStatsLabel).toBe("1 line 6 characters");
  });

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

    const viewData = selectViewData({ state, i18n: EN_I18N });
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
    expect(viewData.sceneSettingsForm.actions.buttons).toEqual([
      {
        id: "save",
        variant: "pr",
        label: "Save",
        type: "submit",
        validate: true,
      },
    ]);
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

    const viewData = selectViewData({ state, i18n: EN_I18N });

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

    const viewData = selectViewData({ state, i18n: EN_I18N });
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
    expect(
      selectViewData({ state, i18n: EN_I18N }).presentationState.dialogue,
    ).toEqual({
      mode: "nvl",
    });

    clearTemporaryPresentationState({ state });

    expect(selectEffectivePresentationState({ state }).dialogue).toEqual({
      mode: "adv",
    });
  });

  it("exposes the presentation state immediately before the selected line", () => {
    const state = createInitialState();
    setSelectedSectionId({ state }, { selectedSectionId: "section-1" });
    setSectionLineChangesBySectionId(
      { state },
      {
        changesBySectionId: {
          "section-1": {
            lines: [
              {
                id: "line-1",
                presentationState: {
                  bgm: {
                    sounds: [{ id: "main", resourceId: "intro" }],
                  },
                },
              },
              {
                id: "line-2",
                presentationState: {
                  bgm: {
                    sounds: [{ id: "main", resourceId: "theme" }],
                  },
                },
              },
            ],
          },
        },
      },
    );
    setSelectedLineId({ state }, { selectedLineId: "line-2" });

    expect(
      selectViewData({ state, i18n: EN_I18N }).previousPresentationState.bgm,
    ).toEqual({
      sounds: [{ id: "main", resourceId: "intro" }],
    });
    expect(selectPreviousPresentationState({ state }).bgm).toEqual({
      sounds: [{ id: "main", resourceId: "intro" }],
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

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.sectionEditorItems).toHaveLength(2);
    expect(viewData.sectionEditorItems[0].selectedLineId).toBe("line-1");
    expect(viewData.sectionEditorItems[0].selectionActive).toBe(true);
    expect(viewData.sectionEditorItems[0].hasPreviousSectionLine).toBe(false);
    expect(viewData.sectionEditorItems[0].hasNextSectionLine).toBe(true);
    expect(viewData.sectionEditorItems[0].documentEditorLines).toHaveLength(2);
    expect(viewData.sectionEditorItems[0].documentLineDecorations[0]).toEqual(
      expect.objectContaining({ id: "line-1", lineNumber: 1 }),
    );
    expect(viewData.sectionEditorItems[1].selectedLineId).toBe("");
    expect(viewData.sectionEditorItems[1].selectionActive).toBe(false);
    expect(viewData.sectionEditorItems[1].hasPreviousSectionLine).toBe(true);
    expect(viewData.sectionEditorItems[1].hasNextSectionLine).toBe(false);
    expect(viewData.sectionEditorItems[1].documentEditorLines).toHaveLength(1);
    expect(viewData.sectionEditorItems[1].documentLineDecorations[0]).toEqual(
      expect.objectContaining({ id: "line-3", lineNumber: 1 }),
    );

    state.backgroundTransformEditor.isOpen = true;
    const transformEditorViewData = selectViewData({ state, i18n: EN_I18N });
    expect(
      transformEditorViewData.sectionEditorItems.every(
        ({ selectionActive }) => selectionActive === false,
      ),
    ).toBe(true);
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

    const viewData = selectViewData({ state, i18n: EN_I18N });

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
