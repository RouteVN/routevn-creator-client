import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setDialogueDefaultValue,
  setLayoutState,
  setRepositoryState,
} from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";

const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};

const TEST_CONSTANTS = {
  dialogueForm: {
    fields: [
      {
        name: "dialogue-character-id",
      },
      {
        name: "dialogue-custom-character-name",
      },
      {
        name: "dialogue-character-name",
      },
      {
        name: "dialogue-content",
      },
    ],
  },
  nvlForm: {
    fields: [],
  },
  choiceForm: {
    fields: [],
  },
  historyForm: {
    fields: [],
  },
  saveLoadForm: {
    fields: [],
  },
};

describe("layoutEditorPreview.store", () => {
  const getNamedFieldNames = (form) => {
    return form.fields
      .map((field) => field.name)
      .filter((name) => typeof name === "string" && name.length > 0);
  };

  it("shows dialogue preview and character options for general layouts using dialogue.characterId", () => {
    const state = createInitialState();
    const charactersData = {
      items: {
        folder: {
          id: "folder",
          type: "folder",
          name: "Cast",
        },
        "character-1": {
          id: "character-1",
          type: "character",
          name: "Aki",
          parentId: "folder",
        },
      },
      tree: [
        {
          id: "folder",
          children: [{ id: "character-1" }],
        },
      ],
    };

    setLayoutState(
      { state },
      {
        layoutState: {
          id: "layout-general",
          layoutType: "general",
          elements: {
            items: {
              badge: {
                id: "badge",
                type: "container",
                $when: 'dialogue.characterId == "character-1"',
              },
            },
            tree: [{ id: "badge" }],
          },
        },
      },
    );
    setRepositoryState(
      { state },
      {
        repositoryState: {
          layouts: EMPTY_COLLECTION,
          images: EMPTY_COLLECTION,
          variables: EMPTY_COLLECTION,
        },
      },
    );

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      props: {
        charactersData,
      },
    });

    expect(viewData.showDialogueForm).toBe(true);
    expect(viewData.showPreviewVariablesForm).toBe(false);
    expect(getNamedFieldNames(viewData.dialogueForm)).toEqual([
      "dialogue-character-id",
      "dialogue-custom-character-name",
      "dialogue-content",
    ]);
    expect(viewData.dialogueContext.characterOptions).toEqual([
      {
        value: "",
        label: "No Character",
      },
      {
        value: "character-1",
        label: "Aki",
      },
    ]);
  });

  it("shows the custom character name input when enabled", () => {
    const state = createInitialState();

    setLayoutState(
      { state },
      {
        layoutState: {
          id: "layout-general",
          layoutType: "general",
          elements: {
            items: {
              badge: {
                id: "badge",
                type: "container",
                $when: 'dialogue.characterId == "character-1"',
              },
            },
            tree: [{ id: "badge" }],
          },
        },
      },
    );
    setRepositoryState(
      { state },
      {
        repositoryState: {
          layouts: EMPTY_COLLECTION,
          images: EMPTY_COLLECTION,
          variables: EMPTY_COLLECTION,
        },
      },
    );
    setDialogueDefaultValue(
      { state },
      {
        name: "dialogue-custom-character-name",
        fieldValue: true,
      },
    );

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
    });

    expect(getNamedFieldNames(viewData.dialogueForm)).toEqual([
      "dialogue-character-id",
      "dialogue-custom-character-name",
      "dialogue-character-name",
      "dialogue-content",
    ]);
  });
});
