import { describe, expect, it } from "vitest";
import {
  createInitialState as createSceneEditorState,
  selectEffectivePresentationState as selectSceneEditorEffectivePresentationState,
  setPresentationState as setSceneEditorPresentationState,
  setSectionLineChanges as setSceneEditorSectionLineChanges,
  setSelectedLineId as setSceneEditorSelectedLineId,
} from "../../src/pages/sceneEditor/sceneEditor.store.js";
import {
  createInitialState as createLexicalSceneEditorState,
  selectEffectivePresentationState as selectLexicalSceneEditorEffectivePresentationState,
  setPresentationState as setLexicalSceneEditorPresentationState,
  setSectionLineChanges as setLexicalSceneEditorSectionLineChanges,
  setSelectedLineId as setLexicalSceneEditorSelectedLineId,
} from "../../src/components/sceneEditorLexical/sceneEditorLexical.store.js";

const stalePresentationState = {
  background: {
    resourceId: "background-previous",
  },
  dialogue: {
    ui: {
      resourceId: "dialogue-previous",
    },
  },
};

const selectedLineChanges = {
  lines: [
    {
      id: "line-next",
      changes: {},
      presentationState: {
        dialogue: {
          ui: {
            resourceId: "dialogue-next",
          },
        },
      },
    },
  ],
};

describe("scene editor selected line presentation state", () => {
  it("syncs the page editor presentation state from section changes when selecting a line", () => {
    const state = createSceneEditorState();

    setSceneEditorPresentationState(
      { state },
      { presentationState: stalePresentationState },
    );
    setSceneEditorSectionLineChanges(
      { state },
      { changes: selectedLineChanges },
    );
    setSceneEditorSelectedLineId({ state }, { selectedLineId: "line-next" });

    expect(selectSceneEditorEffectivePresentationState({ state })).toEqual({
      dialogue: {
        ui: {
          resourceId: "dialogue-next",
        },
      },
    });
  });

  it("syncs the lexical editor presentation state from section changes when selecting a line", () => {
    const state = createLexicalSceneEditorState();

    setLexicalSceneEditorPresentationState(
      { state },
      { presentationState: stalePresentationState },
    );
    setLexicalSceneEditorSectionLineChanges(
      { state },
      { changes: selectedLineChanges },
    );
    setLexicalSceneEditorSelectedLineId(
      { state },
      { selectedLineId: "line-next" },
    );

    expect(
      selectLexicalSceneEditorEffectivePresentationState({ state }),
    ).toEqual({
      dialogue: {
        ui: {
          resourceId: "dialogue-next",
        },
      },
    });
  });
});
