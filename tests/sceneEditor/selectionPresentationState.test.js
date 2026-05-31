import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectEffectivePresentationState,
  selectTemporaryPresentationState,
  setPresentationState,
  setSectionLineChanges,
  setSelectedLineId,
  setTemporaryPresentationState,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.store.js";

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

  it("clears temporary presentation state when selecting a different line", () => {
    const state = createInitialState();

    setSelectedLineId({ state }, { selectedLineId: "line-previous" });
    setPresentationState(
      { state },
      {
        presentationState: {
          background: {
            resourceId: "background-committed",
            transformId: "preset-center",
          },
        },
      },
    );
    setTemporaryPresentationState(
      { state },
      {
        presentationState: {
          background: {
            resourceId: "background-previous",
            x: 1400,
            y: 800,
          },
        },
      },
    );

    setSelectedLineId({ state }, { selectedLineId: "line-next" });

    expect(selectTemporaryPresentationState({ state })).toEqual({});
    expect(selectEffectivePresentationState({ state })).toEqual({
      background: {
        resourceId: "background-committed",
        transformId: "preset-center",
      },
    });
  });

  it("keeps temporary presentation state when reselecting the same line", () => {
    const state = createInitialState();

    setSelectedLineId({ state }, { selectedLineId: "line-next" });
    setTemporaryPresentationState(
      { state },
      {
        presentationState: {
          background: {
            resourceId: "background-next",
            x: 1400,
          },
        },
      },
    );

    setSelectedLineId({ state }, { selectedLineId: "line-next" });

    expect(selectTemporaryPresentationState({ state })).toEqual({
      background: {
        resourceId: "background-next",
        x: 1400,
      },
    });
  });
});
