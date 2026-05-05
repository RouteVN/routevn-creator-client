import { describe, expect, it, vi } from "vitest";
import {
  handleActionsDialogClose,
  handleCommandLineSubmit,
  handleEditorBlur,
  handleNewLine,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";

describe("sceneEditorLexical.handlers actions dialog", () => {
  it("clears temporary presentation state and refreshes the canvas when the actions dialog closes", () => {
    const store = {
      selectActionTargetLineId: vi.fn(() => "line-2"),
      setSelectedLineId: vi.fn(),
      clearActionTargetLineId: vi.fn(),
      clearTemporaryPresentationState: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    handleActionsDialogClose(deps);

    expect(store.setSelectedLineId).toHaveBeenCalledWith({
      selectedLineId: "line-2",
    });
    expect(store.clearActionTargetLineId).toHaveBeenCalledTimes(1);
    expect(store.clearTemporaryPresentationState).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      {
        skipRender: true,
        skipAnimations: true,
      },
    );
  });

  it("clears temporary presentation state and refreshes the canvas when action save fails", async () => {
    const saveError = new Error("save failed");
    const store = {
      selectActionTargetLineId: vi.fn(() => "line-2"),
      selectSelectedLineId: vi.fn(() => "line-1"),
      selectDraftSection: vi.fn(() => undefined),
      setSelectedLineId: vi.fn(),
      clearTemporaryPresentationState: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
      projectService: {
        updateLineActions: vi.fn(async () => {
          throw saveError;
        }),
      },
      appService: {
        showAlert: vi.fn(),
      },
    };

    await expect(
      handleCommandLineSubmit(deps, {
        _event: {
          detail: {
            background: {
              resourceId: "bg-school",
            },
          },
        },
      }),
    ).rejects.toThrow("save failed");

    expect(store.setSelectedLineId).toHaveBeenCalledWith({
      selectedLineId: "line-2",
    });
    expect(store.clearTemporaryPresentationState).toHaveBeenCalledTimes(1);
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      {
        skipRender: true,
        skipAnimations: true,
      },
    );
  });

  it("preserves dialogue content when submitting dialogue metadata changes", async () => {
    const saveError = new Error("stop after assertion");
    const updateLineDialogueAction = vi.fn(async () => {
      throw saveError;
    });
    const store = {
      selectActionTargetLineId: vi.fn(() => undefined),
      selectSelectedLineId: vi.fn(() => "line-1"),
      selectDraftSection: vi.fn(() => undefined),
      setSelectedLineId: vi.fn(),
      clearTemporaryPresentationState: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
      projectService: {
        updateLineDialogueAction,
      },
      appService: {
        showAlert: vi.fn(),
      },
    };

    await expect(
      handleCommandLineSubmit(deps, {
        _event: {
          detail: {
            dialogue: {
              characterId: "character-2",
            },
          },
        },
      }),
    ).rejects.toThrow("stop after assertion");

    expect(updateLineDialogueAction).toHaveBeenCalledWith({
      lineId: "line-1",
      dialogue: {
        characterId: "character-2",
      },
      preserve: ["dialogue.content"],
    });
  });

  it("debounces draft persistence on editor blur instead of flushing immediately", async () => {
    vi.useFakeTimers();
    const state = {
      draftSavePendingSinceAt: 0,
      draftSaveTimerId: undefined,
    };
    const store = {
      selectSkipNextEditorBlurDraftFlush: vi.fn(() => false),
      selectDraftSection: vi.fn(() => ({
        dirty: true,
        sceneId: "scene-1",
        sectionId: "section-1",
        lines: [
          {
            id: "line-1",
            actions: {
              dialogue: {
                content: [{ text: "Hello" }],
              },
            },
          },
        ],
      })),
      selectDraftSaveTimerId: vi.fn(() => state.draftSaveTimerId),
      clearDraftSaveTimer: vi.fn(() => {
        state.draftSaveTimerId = undefined;
      }),
      selectDraftSavePendingSinceAt: vi.fn(() => state.draftSavePendingSinceAt),
      setDraftSavePendingSinceAt: vi.fn(({ timestamp }) => {
        state.draftSavePendingSinceAt = timestamp;
      }),
      selectLastDraftFlushStartedAt: vi.fn(() => 0),
      setDraftSaveTimerId: vi.fn(({ timerId }) => {
        state.draftSaveTimerId = timerId;
      }),
    };
    const syncSectionLinesSnapshot = vi.fn(async () => {});

    try {
      handleEditorBlur({
        store,
        render: vi.fn(),
        projectService: {
          syncSectionLinesSnapshot,
        },
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(store.setDraftSaveTimerId).toHaveBeenCalledTimes(1);
      expect(syncSectionLinesSnapshot).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not copy control actions onto newly inserted draft lines", async () => {
    vi.useFakeTimers();
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    const state = {
      draftSavePendingSinceAt: 0,
      draftSaveTimerId: undefined,
      selectedLineId: "line-1",
      draftSection: {
        sceneId: "scene-1",
        sectionId: "section-1",
        dirty: false,
        lines: [
          {
            id: "line-1",
            sectionId: "section-1",
            actions: {
              dialogue: {
                content: [{ text: "Hello" }],
              },
              control: {
                resourceId: "control-1",
                resourceType: "control",
              },
            },
          },
        ],
      },
    };
    const store = {
      selectIsSectionsOverviewOpen: vi.fn(() => false),
      selectDraftSaveTimerId: vi.fn(() => state.draftSaveTimerId),
      clearDraftSaveTimer: vi.fn(() => {
        state.draftSaveTimerId = undefined;
      }),
      selectDraftSection: vi.fn(() => state.draftSection),
      setDraftSection: vi.fn(({ draftSection }) => {
        state.draftSection = draftSection;
      }),
      selectSelectedLineId: vi.fn(() => state.selectedLineId),
      setSelectedLineId: vi.fn(({ selectedLineId }) => {
        state.selectedLineId = selectedLineId;
      }),
      selectDraftSavePendingSinceAt: vi.fn(
        () => state.draftSavePendingSinceAt,
      ),
      setDraftSavePendingSinceAt: vi.fn(({ timestamp }) => {
        state.draftSavePendingSinceAt = timestamp;
      }),
      selectLastDraftFlushStartedAt: vi.fn(() => 0),
      setDraftSaveTimerId: vi.fn(({ timerId }) => {
        state.draftSaveTimerId = timerId;
      }),
    };

    globalThis.requestAnimationFrame = vi.fn(() => 1);

    try {
      await handleNewLine(
        {
          store,
          render: vi.fn(),
          subject: {
            dispatch: vi.fn(),
          },
          refs: {},
        },
        {
          _event: {
            detail: {
              lineId: "line-1",
              position: "after",
            },
          },
        },
      );

      expect(state.draftSection.lines).toHaveLength(2);
      expect(state.draftSection.lines[0].actions.control).toEqual({
        resourceId: "control-1",
        resourceType: "control",
      });
      expect(state.draftSection.lines[1].actions).toEqual({
        dialogue: {
          content: [{ text: "" }],
        },
      });
    } finally {
      vi.useRealTimers();
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
    }
  });
});
