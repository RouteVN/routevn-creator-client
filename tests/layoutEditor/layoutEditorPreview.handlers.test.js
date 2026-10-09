import { describe, expect, it, vi } from "vitest";
import {
  handleDialogueFormChange,
  handleInputFieldsFormChange,
  handleOnUpdate,
} from "../../src/components/layoutEditorPreview/layoutEditorPreview.handlers.js";
import * as previewStore from "../../src/components/layoutEditorPreview/layoutEditorPreview.store.js";
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
        selectDialogueDefaultValues: () => state.dialogueDefaultValues,
        selectRepositoryState: () => state.repositoryState,
        setDialogueDefaultValue: ({ name, fieldValue }) => {
          state.dialogueDefaultValues[name] = fieldValue;
        },
        setPreviewInputFieldValue: ({ name, fieldValue }) => {
          state.previewInputFieldValues[name] = fieldValue;
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

  it("writes input field preview edits into preview state", () => {
    const { state, deps } = createDeps();

    handleInputFieldsFormChange(deps, createPayload("name", "Ada"));

    expect(state.previewInputFieldValues).toEqual({
      name: "Ada",
    });
    expect(deps.render).toHaveBeenCalled();
    expect(deps.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
  });
});

describe("layoutEditorPreview.handleOnUpdate", () => {
  const layoutState = {
    id: "layout-dialogue",
    layoutType: "dialogue-adv",
    elements: EMPTY_COLLECTION,
  };
  const reverseKeys = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, entry]) => [key, reverseKeys(entry)]),
    );
  };
  const createUpdateDeps = () => {
    const { state, deps } = createDeps();
    deps.store.setLayoutState = (payload) =>
      previewStore.setLayoutState({ state }, payload);
    deps.store.selectPreviewData = () =>
      previewStore.selectPreviewData({ state });
    deps.store.hydratePreviewState = vi.fn((payload) =>
      previewStore.hydratePreviewState({ state }, payload),
    );
    deps.store.hydratePreviewState({
      previewData: { backgroundImageId: "image-one" },
    });
    deps.store.hydratePreviewState.mockClear();
    return deps;
  };

  it("does not hydrate again what it already shows, which would remount its forms", async () => {
    const deps = createUpdateDeps();
    const shown = deps.store.selectPreviewData();

    await handleOnUpdate(deps, {
      oldProps: { layoutState, initialPreviewData: {} },
      newProps: { layoutState, initialPreviewData: reverseKeys(shown) },
    });

    expect(deps.store.hydratePreviewState).not.toHaveBeenCalled();
    expect(deps.store.selectPreviewData()).toEqual(shown);
  });

  it("tells the page which preview data the user edited, so only that is saved", async () => {
    const deps = createUpdateDeps();
    const editedFlags = () =>
      deps.dispatchEvent.mock.calls
        .map(([event]) => event)
        .filter((event) => event.type === "preview-data-change")
        .map((event) => event.detail.edited);

    // Saved data handed back to it is derived again, not edited.
    await handleOnUpdate(deps, {
      oldProps: { layoutState, initialPreviewData: {} },
      newProps: {
        layoutState,
        initialPreviewData: { backgroundImageId: "image-two" },
      },
    });
    handleDialogueFormChange(
      deps,
      createPayload("dialogue-content", "Hello one"),
    );

    expect(editedFlags()).toEqual([false, true]);
  });

  it("hydrates preview data that differs from what it shows", async () => {
    const deps = createUpdateDeps();
    const previewData = {
      ...deps.store.selectPreviewData(),
      backgroundImageId: "image-two",
    };

    await handleOnUpdate(deps, {
      oldProps: { layoutState, initialPreviewData: {} },
      newProps: { layoutState, initialPreviewData: previewData },
    });

    expect(deps.store.hydratePreviewState).toHaveBeenCalledWith({
      previewData,
    });
    expect(deps.store.selectPreviewData().backgroundImageId).toBe("image-two");
  });
});
