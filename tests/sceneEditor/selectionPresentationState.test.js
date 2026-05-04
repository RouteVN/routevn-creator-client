import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectEffectivePresentationState,
  setPresentationState,
  setSectionLineChanges,
  setSelectedLineId,
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
  it("syncs the lexical editor presentation state from section changes when selecting a line", () => {
    const state = createInitialState();

    setPresentationState({ state }, { presentationState: stalePresentationState });
    setSectionLineChanges(
      { state },
      { changes: selectedLineChanges },
    );
    setSelectedLineId({ state }, { selectedLineId: "line-next" });

    expect(selectEffectivePresentationState({ state })).toEqual({
      dialogue: {
        ui: {
          resourceId: "dialogue-next",
        },
      },
    });
  });

  it("does not clear lexical editor presentation state when section changes are stale", () => {
    const state = createInitialState();

    setPresentationState({ state }, { presentationState: stalePresentationState });
    setSectionLineChanges(
      { state },
      {
        changes: {
          lines: [
            {
              id: "line-other",
              changes: {},
              presentationState: {
                dialogue: {
                  ui: {
                    resourceId: "dialogue-other",
                  },
                },
              },
            },
          ],
        },
      },
    );
    setSelectedLineId({ state }, { selectedLineId: "line-next" });

    expect(selectEffectivePresentationState({ state })).toEqual(
      stalePresentationState,
    );
  });

  it("syncs lexical editor presentation state when fresh section changes arrive", () => {
    const state = createInitialState();

    setPresentationState({ state }, { presentationState: stalePresentationState });
    setSelectedLineId({ state }, { selectedLineId: "line-next" });
    setSectionLineChanges({ state }, { changes: selectedLineChanges });

    expect(selectEffectivePresentationState({ state })).toEqual({
      dialogue: {
        ui: {
          resourceId: "dialogue-next",
        },
      },
    });
  });
});
