import { describe, expect, it } from "vitest";
import {
  createInitialState as createLayoutEditorState,
  setPreviewData as setLayoutEditorPreviewData,
  syncRepositoryState as syncLayoutEditorRepositoryState,
} from "../../src/pages/layoutEditor/layoutEditor.store.js";
import {
  createInitialState as createPreviewComponentState,
  hydratePreviewState,
  selectPreviewData,
  setLayoutState,
  setRepositoryState,
} from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";

const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};

describe("layoutEditor preview persistence", () => {
  it("hydrates persisted preview data back into the preview component state", () => {
    const state = createPreviewComponentState();
    const persistedPreviewData = {
      backgroundImageId: "image-preview",
      variables: {
        score: 7,
      },
      runtime: {
        dialogueTextSpeed: 25,
        autoMode: true,
        skipMode: false,
        isLineCompleted: true,
      },
      dialogue: {
        characterId: "character-1",
        character: {
          name: "Aki",
        },
        content: [{ text: "Saved dialogue preview" }],
      },
      historyDialogue: [],
      choice: {
        items: [],
      },
      saveSlots: [],
    };

    setLayoutState(
      { state },
      {
        layoutState: {
          id: "layout-dialogue",
          layoutType: "dialogue-adv",
          elements: EMPTY_COLLECTION,
        },
      },
    );
    setRepositoryState(
      { state },
      {
        repositoryState: {
          layouts: EMPTY_COLLECTION,
          images: EMPTY_COLLECTION,
          variables: {
            items: {
              score: {
                id: "score",
                type: "variable",
                variableType: "number",
                name: "Score",
                value: 0,
              },
            },
            tree: [],
          },
        },
      },
    );

    hydratePreviewState(
      { state },
      {
        previewData: persistedPreviewData,
      },
    );

    expect(state.dialogueDefaultValues).toMatchObject({
      "dialogue-character-id": "character-1",
      "dialogue-custom-character-name": true,
      "dialogue-character-name": "Aki",
      "dialogue-content": "Saved dialogue preview",
    });
    expect(state.previewVariableValues).toMatchObject({
      "variables.score": 7,
    });
    expect(selectPreviewData({ state })).toMatchObject({
      backgroundImageId: "image-preview",
      runtime: {
        dialogueTextSpeed: 25,
        autoMode: true,
        skipMode: false,
        isLineCompleted: true,
      },
      dialogue: {
        characterId: "character-1",
        character: {
          name: "Aki",
        },
        content: [{ text: "Saved dialogue preview" }],
      },
    });
  });

  it("loads persisted preview data but preserves unsaved local preview edits on refresh", () => {
    const state = createLayoutEditorState();

    syncLayoutEditorRepositoryState(
      { state },
      {
        projectResolution: {
          width: 1280,
          height: 720,
        },
        layoutId: "layout-1",
        resourceType: "layouts",
        layout: {
          id: "layout-1",
          type: "layout",
          name: "Layout",
          layoutType: "general",
          elements: EMPTY_COLLECTION,
        },
        persistedPreviewData: {
          backgroundImageId: "image-a",
        },
        layoutData: EMPTY_COLLECTION,
        images: EMPTY_COLLECTION,
        spritesheetsData: EMPTY_COLLECTION,
        particlesData: EMPTY_COLLECTION,
        layoutsData: EMPTY_COLLECTION,
        textStylesData: EMPTY_COLLECTION,
        colorsData: EMPTY_COLLECTION,
        fontsData: EMPTY_COLLECTION,
        variablesData: EMPTY_COLLECTION,
      },
    );

    expect(state.previewData).toEqual({
      backgroundImageId: "image-a",
    });
    expect(state.initialPreviewData).toEqual({
      backgroundImageId: "image-a",
    });

    setLayoutEditorPreviewData(
      { state },
      {
        previewData: {
          backgroundImageId: "image-local",
        },
      },
    );

    syncLayoutEditorRepositoryState(
      { state },
      {
        projectResolution: {
          width: 1280,
          height: 720,
        },
        layoutId: "layout-1",
        resourceType: "layouts",
        layout: {
          id: "layout-1",
          type: "layout",
          name: "Layout",
          layoutType: "general",
          elements: EMPTY_COLLECTION,
        },
        persistedPreviewData: {
          backgroundImageId: "image-remote",
        },
        layoutData: EMPTY_COLLECTION,
        images: EMPTY_COLLECTION,
        spritesheetsData: EMPTY_COLLECTION,
        particlesData: EMPTY_COLLECTION,
        layoutsData: EMPTY_COLLECTION,
        textStylesData: EMPTY_COLLECTION,
        colorsData: EMPTY_COLLECTION,
        fontsData: EMPTY_COLLECTION,
        variablesData: EMPTY_COLLECTION,
      },
    );

    expect(state.previewData).toEqual({
      backgroundImageId: "image-local",
    });
    expect(state.initialPreviewData).toEqual({
      backgroundImageId: "image-a",
    });
    expect(state.persistedPreviewData).toEqual({
      backgroundImageId: "image-remote",
    });
  });
});
