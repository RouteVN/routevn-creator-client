import { describe, expect, it, vi } from "vitest";
import { handleDialogueFormChange } from "../../src/components/layoutEditorPreview/layoutEditorPreview.handlers.js";
import {
  createInitialState,
  setLayoutState,
  setRepositoryState,
} from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";

const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};

const CHARACTERS_DATA = {
  items: {
    "character-1": {
      id: "character-1",
      type: "character",
      name: "Aki",
    },
    "character-2": {
      id: "character-2",
      type: "character",
      name: "Mina",
    },
  },
  tree: [{ id: "character-1" }, { id: "character-2" }],
};

const createDeps = () => {
  const state = createInitialState();

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
        variables: EMPTY_COLLECTION,
        characters: CHARACTERS_DATA,
      },
    },
  );

  return {
    state,
    deps: {
      props: {},
      store: {
        getState: () => state,
        selectRepositoryState: () => state.repositoryState,
        setDialogueDefaultValue: ({ name, fieldValue }) => {
          state.dialogueDefaultValues[name] = fieldValue;
        },
        selectPreviewData: () => ({}),
      },
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    },
  };
};

const createPayload = (name, value) => {
  return {
    _event: {
      detail: {
        name,
        value,
      },
    },
  };
};

describe("layoutEditorPreview.handlers", () => {
  it("syncs the character name from the selected character when custom naming is off", () => {
    const { state, deps } = createDeps();

    handleDialogueFormChange(
      deps,
      createPayload("dialogue-character-id", "character-1"),
    );

    expect(state.dialogueDefaultValues).toMatchObject({
      "dialogue-character-id": "character-1",
      "dialogue-character-name": "Aki",
      "dialogue-custom-character-name": false,
    });
  });

  it("keeps the custom character name when switching characters with custom naming on", () => {
    const { state, deps } = createDeps();

    handleDialogueFormChange(
      deps,
      createPayload("dialogue-character-id", "character-1"),
    );
    handleDialogueFormChange(
      deps,
      createPayload("dialogue-custom-character-name", true),
    );
    handleDialogueFormChange(
      deps,
      createPayload("dialogue-character-name", "Boss"),
    );
    handleDialogueFormChange(
      deps,
      createPayload("dialogue-character-id", "character-2"),
    );

    expect(state.dialogueDefaultValues).toMatchObject({
      "dialogue-character-id": "character-2",
      "dialogue-character-name": "Boss",
      "dialogue-custom-character-name": true,
    });
  });

  it("resets the preview character name back to the selected character when custom naming is turned off", () => {
    const { state, deps } = createDeps();

    handleDialogueFormChange(
      deps,
      createPayload("dialogue-character-id", "character-1"),
    );
    handleDialogueFormChange(
      deps,
      createPayload("dialogue-custom-character-name", true),
    );
    handleDialogueFormChange(
      deps,
      createPayload("dialogue-character-name", "Boss"),
    );
    handleDialogueFormChange(
      deps,
      createPayload("dialogue-custom-character-name", false),
    );

    expect(state.dialogueDefaultValues).toMatchObject({
      "dialogue-character-id": "character-1",
      "dialogue-character-name": "Aki",
      "dialogue-custom-character-name": false,
    });
  });
});
