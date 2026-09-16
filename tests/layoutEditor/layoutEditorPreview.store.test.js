import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { EN_I18N } from "../support/i18n.js";
import {
  applyImageSelectorSelection,
  closeImageSelectorDialog,
  createInitialState,
  hydratePreviewState,
  openImageSelectorDialog,
  selectPreviewData,
  selectViewData,
  setDialogueDefaultValue,
  setImageSelectorSelection,
  setLayoutState,
  setPreviewInputFieldValue,
  setRepositoryState,
  showImageSelectorCharacters,
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
        type: "row",
        fields: [
          {
            name: "dialogue-custom-character-name",
          },
          {
            name: "dialogue-character-name",
          },
        ],
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
  it("groups speakers by folder with avatar images and keeps missing selections", () => {
    const state = createInitialState();
    state.repositoryState.characters = {
      items: {
        root: {
          type: "character",
          name: "Character One",
          fileId: "avatar-one",
        },
        cast: { type: "folder", name: "Cast" },
        group: { type: "folder", name: "Guests" },
        empty: { type: "folder", name: "Empty" },
        two: { type: "character", name: "Character Two" },
        three: {
          type: "character",
          name: "Character Three",
          fileId: "avatar-three",
        },
      },
      tree: [
        {
          id: "cast",
          children: [
            { id: "group", children: [{ id: "three" }] },
            { id: "two" },
          ],
        },
        { id: "root" },
        { id: "empty" },
      ],
    };
    state.speakerAvatarUrls = {
      "avatar-one": "blob:one",
      "avatar-three": "blob:three",
    };
    state.dialogueDefaultValues["dialogue-character-id"] = "missing";
    const view = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });
    expect(view.dialogueContext.characterOptions).toEqual([
      { value: "missing", label: "Missing Character (missing)" },
      { value: "root", label: "Character One", imageSrc: "blob:one" },
      { type: "section", label: "Cast" },
      { value: "two", label: "Character Two" },
      { type: "section", label: "Cast > Guests" },
      { value: "three", label: "Character Three", imageSrc: "blob:three" },
    ]);
  });

  it("offers an avatar picker and transform folder sections below custom speaker name", () => {
    const state = createInitialState();
    const constants = yaml.load(
      readFileSync(
        new URL(
          "../../src/components/layoutEditorPreview/layoutEditorPreview.constants.yaml",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    state.repositoryState = {
      characters: {
        items: {
          "character-1": {
            id: "character-1",
            type: "character",
            name: "Character One",
            sprites: {
              items: {
                folder: { id: "folder", type: "folder", name: "Faces" },
                "sprite-1": {
                  id: "sprite-1",
                  type: "image",
                  name: "Smile",
                  fileId: "file-1",
                },
                "sprite-2": {
                  id: "sprite-2",
                  type: "spritesheet",
                  name: "Blink",
                  fileId: "file-2",
                },
              },
              tree: [
                {
                  id: "folder",
                  children: [{ id: "sprite-1" }, { id: "sprite-2" }],
                },
              ],
            },
          },
        },
        tree: [{ id: "character-1" }],
      },
      transforms: {
        items: {
          folder: { id: "folder", type: "folder", name: "Portraits" },
          "transform-1": { id: "transform-1", type: "transform", name: "Left" },
          "transform-2": {
            id: "transform-2",
            type: "transform",
            name: "Center",
          },
          nested: { id: "nested", type: "folder", name: "Zoom" },
          "transform-3": {
            id: "transform-3",
            type: "transform",
            name: "Close",
          },
        },
        tree: [
          {
            id: "folder",
            children: [
              { id: "transform-1" },
              { id: "nested", children: [{ id: "transform-3" }] },
            ],
          },
          { id: "transform-2" },
        ],
      },
    };
    state.dialogueDefaultValues["dialogue-character-sprite-id"] = "sprite-1";
    const view = selectViewData({ state, constants, i18n: EN_I18N });
    const rows = view.dialogueForm.fields.filter(
      (field) => field.type === "row",
    );
    expect(rows[1]).toMatchObject({
      stackAt: "none",
      fields: [
        {
          slot: "dialogueCharacterAvatar",
          type: "slot",
        },
        {
          name: "dialogue-character-sprite-transform-id",
          type: "select",
          clearable: true,
        },
      ],
    });
    expect(view.characterAvatarPreview).toMatchObject({
      kind: "image",
      fileId: "file-1",
    });
    expect(view.dialogueContext.transformOptions).toEqual([
      { value: "transform-2", label: "Center" },
      { type: "section", label: "Portraits" },
      { value: "transform-1", label: "Left" },
      { type: "section", label: "Portraits > Zoom" },
      { value: "transform-3", label: "Close" },
    ]);
  });

  it("selects a character before its sprite, preserving saved values until confirmation", () => {
    const state = createInitialState();
    state.repositoryState.characters = {
      items: {
        "character-1": {
          id: "character-1",
          type: "character",
          name: "Character One",
          sprites: {
            items: {
              "sprite-1": { id: "sprite-1", type: "image", name: "Smile" },
            },
            tree: [{ id: "sprite-1" }],
          },
        },
        "character-2": {
          id: "character-2",
          type: "character",
          name: "Character Two",
          sprites: {
            items: {
              "sprite-2": { id: "sprite-2", type: "image", name: "Wave" },
            },
            tree: [{ id: "sprite-2" }],
          },
        },
      },
      tree: [{ id: "character-1" }, { id: "character-2" }],
    };
    state.previewBackgroundImageId = "background-1";
    state.dialogueDefaultValues["dialogue-character-sprite-id"] = "sprite-1";
    openImageSelectorDialog({ state }, { resourceTarget: "characterSprites" });
    expect(state.imageSelectorDialog).toMatchObject({
      resourceTarget: "characters",
      characterId: "character-1",
      selectedImageId: "sprite-1",
    });
    applyImageSelectorSelection({ state });
    expect(state.imageSelectorDialog.open).toBe(true);
    setImageSelectorSelection({ state }, { imageId: "character-1" });
    expect(state.imageSelectorDialog.selectedImageId).toBe("sprite-1");
    showImageSelectorCharacters({ state });
    setImageSelectorSelection({ state }, { imageId: "character-2" });
    expect(state.imageSelectorDialog).toMatchObject({
      resourceTarget: "characterSprites",
      characterId: "character-2",
      selectedImageId: undefined,
    });
    const view = selectViewData({
      state,
      constants: TEST_CONSTANTS,
      i18n: EN_I18N,
    });
    expect(view.imageSelectorConfirmDisabled).toBe(true);
    expect(view.fileExplorerItems.map((item) => item.name)).toEqual([
      "Character Two",
    ]);
    expect(view.imageSelectorCharacterName).toBe("Character Two");
    applyImageSelectorSelection({ state });
    expect(state.imageSelectorDialog.open).toBe(true);
    setImageSelectorSelection({ state }, { imageId: "sprite-2" });
    closeImageSelectorDialog({ state });
    expect(state.dialogueDefaultValues["dialogue-character-sprite-id"]).toBe(
      "sprite-1",
    );
    openImageSelectorDialog({ state }, { resourceTarget: "characterSprites" });
    setImageSelectorSelection({ state }, { imageId: "character-2" });
    setImageSelectorSelection({ state }, { imageId: "sprite-2" });
    applyImageSelectorSelection({ state });
    expect(state.imageSelectorDialog.open).toBe(false);
    expect(state.dialogueDefaultValues["dialogue-character-sprite-id"]).toBe(
      "sprite-2",
    );
    expect(state.previewBackgroundImageId).toBe("background-1");
    openImageSelectorDialog({ state });
    expect(state.imageSelectorDialog.resourceTarget).toBe("images");
    expect(state.imageSelectorDialog.selectedImageId).toBe("background-1");
    setImageSelectorSelection({ state }, { imageId: "background-2" });
    applyImageSelectorSelection({ state });
    expect(state.previewBackgroundImageId).toBe("background-2");
    expect(state.dialogueDefaultValues["dialogue-character-sprite-id"]).toBe(
      "sprite-2",
    );
  });

  it("preserves avatar and transform selections through preview persistence and clearing", () => {
    const state = createInitialState();
    state.layoutState = {
      id: "layout-1",
      layoutType: "dialogue-adv",
      elements: EMPTY_COLLECTION,
    };
    setDialogueDefaultValue(
      { state },
      { name: "dialogue-character-sprite-id", fieldValue: "sprite-1" },
    );
    setDialogueDefaultValue(
      { state },
      {
        name: "dialogue-character-sprite-transform-id",
        fieldValue: "transform-1",
      },
    );
    const previewData = selectPreviewData({ state });
    expect(previewData.dialogue.character.sprite).toEqual({
      transformId: "transform-1",
      items: [{ id: "base", resourceId: "sprite-1" }],
    });
    hydratePreviewState({ state }, { previewData });
    expect(state.dialogueDefaultValues).toMatchObject({
      "dialogue-character-sprite-id": "sprite-1",
      "dialogue-character-sprite-transform-id": "transform-1",
    });
    setDialogueDefaultValue(
      { state },
      { name: "dialogue-character-sprite-id", fieldValue: undefined },
    );
    expect(
      selectPreviewData({ state }).dialogue.character.sprite.items,
    ).toEqual([]);
    setDialogueDefaultValue(
      { state },
      { name: "dialogue-character-sprite-transform-id", fieldValue: undefined },
    );
    expect(selectPreviewData({ state }).dialogue.character).not.toHaveProperty(
      "sprite",
    );
  });

  const getNamedFieldNames = (form) => {
    const getFieldNames = (fields = []) => {
      return fields.flatMap((field) => {
        const names =
          typeof field.name === "string" && field.name.length > 0
            ? [field.name]
            : [];
        return [...names, ...getFieldNames(field.fields)];
      });
    };

    return getFieldNames(form.fields);
  };

  const getDialogueNameRow = (form) => {
    return form.fields.find((field) => field.type === "row");
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
      i18n: EN_I18N,
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
    expect(
      getNamedFieldNames(getDialogueNameRow(viewData.dialogueForm)),
    ).toEqual(["dialogue-custom-character-name"]);
    expect(viewData.dialogueContext.characterOptions).toEqual([
      { type: "section", label: "Cast" },
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
      i18n: EN_I18N,
      state,
      constants: TEST_CONSTANTS,
    });

    expect(getNamedFieldNames(viewData.dialogueForm)).toEqual([
      "dialogue-character-id",
      "dialogue-custom-character-name",
      "dialogue-character-name",
      "dialogue-content",
    ]);
    expect(
      getNamedFieldNames(getDialogueNameRow(viewData.dialogueForm)),
    ).toEqual(["dialogue-custom-character-name", "dialogue-character-name"]);
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
      i18n: EN_I18N,
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

describe("dialogue preview avatar defaults", () => {
  it.each([undefined, "transform-default"])(
    "uses project default %s for a new avatar",
    (defaultId) => {
      const state = createInitialState();
      state.repositoryState.project = {
        defaultDialogueAvatarTransformId: defaultId,
      };
      state.imageSelectorDialog.resourceTarget = "characterSprites";
      state.imageSelectorDialog.selectedImageId = "sprite-one";
      applyImageSelectorSelection({ state });
      expect(state.dialogueDefaultValues["dialogue-character-sprite-id"]).toBe(
        "sprite-one",
      );
      expect(
        state.dialogueDefaultValues["dialogue-character-sprite-transform-id"],
      ).toBe(defaultId);
    },
  );

  it.each([undefined, "transform-custom"])(
    "keeps the existing preview transform %s when switching sprites",
    (transformId) => {
      const state = createInitialState();
      state.repositoryState.project = {
        defaultDialogueAvatarTransformId: "transform-default",
      };
      state.dialogueDefaultValues["dialogue-character-sprite-id"] =
        "sprite-one";
      state.dialogueDefaultValues["dialogue-character-sprite-transform-id"] =
        transformId;
      state.imageSelectorDialog.resourceTarget = "characterSprites";
      state.imageSelectorDialog.selectedImageId = "sprite-two";
      applyImageSelectorSelection({ state });
      expect(
        state.dialogueDefaultValues["dialogue-character-sprite-transform-id"],
      ).toBe(transformId);
    },
  );
});
