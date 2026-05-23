import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectPreviewData,
  selectViewData,
  setDialogueDefaultValue,
  setLayoutState,
  setPreviewInputFieldValue,
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

  it("shows preview controls for every input field in the layout", () => {
    const state = createInitialState();

    setLayoutState(
      { state },
      {
        layoutState: {
          id: "layout-input",
          layoutType: "input",
          elements: {
            items: {
              "name-input": {
                id: "name-input",
                type: "input",
                name: "Name Input",
                field: "name",
                value: "Ada",
                placeholder: "Name",
              },
              "code-input": {
                id: "code-input",
                type: "input",
                name: "Code Input",
                field: "code",
                value: "B42",
                placeholder: "Code",
              },
              "name-confirm": {
                id: "name-confirm",
                type: "input",
                name: "Confirm Name",
                field: "name",
                value: "Other",
              },
            },
            tree: [
              { id: "name-input" },
              { id: "code-input" },
              { id: "name-confirm" },
            ],
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
    setPreviewInputFieldValue(
      { state },
      {
        name: "name",
        fieldValue: "Mina",
      },
    );

    const viewData = selectViewData({
      state,
      constants: TEST_CONSTANTS,
    });

    expect(viewData.showInputFieldsForm).toBe(true);
    expect(viewData.showPreviewVariablesForm).toBe(false);
    expect(viewData.inputFieldsDefaultValues).toEqual({
      name: "Mina",
      code: "B42",
    });
    expect(getNamedFieldNames(viewData.inputFieldsForm)).toEqual([
      "name",
      "code",
    ]);
    expect(viewData.inputFieldsForm.fields.slice(1)).toMatchObject([
      {
        name: "name",
        label: "Name Input",
        placeholder: "Name",
      },
      {
        name: "code",
        label: "Code Input",
        placeholder: "Code",
      },
    ]);
    expect(selectPreviewData({ state }).form.values).toEqual({
      name: "Mina",
      code: "B42",
    });
  });
});
