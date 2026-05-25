import { describe, expect, it, vi } from "vitest";
import {
  applyBackgroundTransformResizeChange,
  handleActionsDialogClose,
  handleBackgroundTransformEditorCloseClick,
  handleCommandLineSubmit,
  handleDropdownMenuClickItem,
  handleEditorBlur,
  handleNewLine,
  handleSectionMoveSceneFormActionClick,
  handleSelectedLineChanged,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";

describe("sceneEditorLexical.handlers transform editor resize", () => {
  it("keeps x and y fixed while scaling from the anchor", () => {
    const transform = {
      x: 100,
      y: 120,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 2,
      scaleY: 2,
      rotation: 0,
      originX: 50,
      originY: 25,
    };

    const updatedTransform = applyBackgroundTransformResizeChange({
      transform,
      dragStartPosition: {
        x: 300,
        y: 0,
        resizeEdge: "right",
        selectedElementMetrics: {
          width: 200,
          height: 100,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        transformStartScaleX: 2,
        transformStartScaleY: 2,
      },
      x: 350,
      y: 0,
    });

    expect(updatedTransform).toEqual({
      ...transform,
      scaleX: 3,
      scaleY: 3,
    });
  });
});

describe("sceneEditorLexical.handlers actions dialog", () => {
  it("closes only the background transform editor when Done is clicked", () => {
    const handleSetBackgroundCustomTransform = vi.fn();
    const open = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const editor = {
      background: {
        resourceId: "bg-school",
        transformId: "bg-center",
      },
      transform: {
        x: 100,
        y: 120,
      },
    };
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback) => {
        callback();
        return 1;
      });
    const deps = {
      refs: {
        systemActions: {
          transformedHandlers: {
            handleSetBackgroundCustomTransform,
            open,
          },
        },
      },
      store: {
        selectBackgroundTransformEditor: vi.fn(() => editor),
        selectSelectedLine: vi.fn(() => ({
          actions: {
            background: {
              resourceId: "bg-school",
              transformId: "bg-center",
            },
          },
        })),
        closeBackgroundTransformEditor: vi.fn(),
        suppressNextActionsDialogClose: vi.fn(),
        clearSuppressNextActionsDialogClose: vi.fn(),
      },
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    try {
      handleBackgroundTransformEditorCloseClick(deps, {
        _event: {
          preventDefault,
          stopPropagation,
          stopImmediatePropagation,
        },
      });
    } finally {
      setTimeoutSpy.mockRestore();
    }

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(deps.store.suppressNextActionsDialogClose).toHaveBeenCalledTimes(1);
    expect(
      deps.store.clearSuppressNextActionsDialogClose,
    ).toHaveBeenCalledTimes(1);
    expect(handleSetBackgroundCustomTransform).toHaveBeenCalledWith({
      background: editor.background,
      transform: editor.transform,
    });
    expect(open).toHaveBeenCalledWith({
      mode: "background",
      actions: {
        background: {
          resourceId: "bg-school",
          x: 100,
          y: 120,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          originX: 0,
          originY: 0,
        },
      },
    });
    expect(deps.store.closeBackgroundTransformEditor).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(2);
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      {
        skipRender: true,
        skipAnimations: true,
        skipAudio: true,
      },
    );
  });

  it("ignores actions dialog close events suppressed by transform Done", () => {
    const store = {
      selectSuppressNextActionsDialogClose: vi.fn(() => true),
      clearSuppressNextActionsDialogClose: vi.fn(),
      selectActionTargetLineId: vi.fn(),
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

    expect(store.clearSuppressNextActionsDialogClose).toHaveBeenCalledTimes(1);
    expect(store.clearTemporaryPresentationState).not.toHaveBeenCalled();
    expect(store.clearActionTargetLineId).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.subject.dispatch).not.toHaveBeenCalled();
  });

  it("ignores actions dialog close events while the transform editor is open", () => {
    const store = {
      selectSuppressNextActionsDialogClose: vi.fn(() => false),
      selectIsBackgroundTransformEditorOpen: vi.fn(() => true),
      selectActionTargetLineId: vi.fn(),
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

    expect(store.clearTemporaryPresentationState).not.toHaveBeenCalled();
    expect(store.clearActionTargetLineId).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.subject.dispatch).not.toHaveBeenCalled();
  });

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
      selectDraftSavePendingSinceAt: vi.fn(() => state.draftSavePendingSinceAt),
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

  it("focuses text mode on the created line for new-line shortcuts", async () => {
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
      selectDraftSavePendingSinceAt: vi.fn(() => state.draftSavePendingSinceAt),
      setDraftSavePendingSinceAt: vi.fn(({ timestamp }) => {
        state.draftSavePendingSinceAt = timestamp;
      }),
      selectLastDraftFlushStartedAt: vi.fn(() => 0),
      setDraftSaveTimerId: vi.fn(({ timerId }) => {
        state.draftSaveTimerId = timerId;
      }),
    };
    const linesEditor = {
      focusContainer: vi.fn(),
      focusLine: vi.fn(),
      scrollLineIntoView: vi.fn(),
    };

    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      await handleNewLine(
        {
          store,
          render: vi.fn(),
          subject: {
            dispatch: vi.fn(),
          },
          refs: {
            linesEditor,
          },
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

      const createdLine = state.draftSection.lines[1];
      expect(state.selectedLineId).toBe(createdLine.id);
      expect(linesEditor.focusLine).toHaveBeenCalledTimes(2);
      expect(linesEditor.focusLine).toHaveBeenCalledWith({
        sectionId: "section-1",
        lineId: createdLine.id,
        cursorPosition: 0,
      });
      expect(linesEditor.focusContainer).not.toHaveBeenCalled();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
    }
  });

  it("does not move the last section out of a scene", async () => {
    const store = {
      selectSectionMoveSceneDialog: vi.fn(() => ({
        sectionId: "section-1",
      })),
      selectSceneId: vi.fn(() => "scene-1"),
      selectCommittedScene: vi.fn(() => ({
        id: "scene-1",
        sections: [{ id: "section-1" }],
      })),
      hideSectionMoveSceneDialog: vi.fn(),
    };
    const moveSectionItem = vi.fn();
    const deps = {
      store,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
      projectService: {
        moveSectionItem,
      },
      appService: {
        showAlert: vi.fn(),
      },
    };

    await handleSectionMoveSceneFormActionClick(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            sceneId: "scene-2",
          },
        },
      },
    });

    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      message: "This scene must keep at least one section.",
      title: "Error",
    });
    expect(moveSectionItem).not.toHaveBeenCalled();
    expect(store.hideSectionMoveSceneDialog).not.toHaveBeenCalled();
  });

  it("selects the originating section when a line is clicked in another editor", () => {
    const state = {
      selectedSectionId: "section-1",
      selectedLineId: "line-1",
      payload: {
        sceneId: "scene-1",
        sectionId: "section-1",
        lineId: "line-1",
      },
    };
    const store = {
      selectSelectedSectionId: vi.fn(() => state.selectedSectionId),
      setSelectedSectionId: vi.fn(({ selectedSectionId }) => {
        state.selectedSectionId = selectedSectionId;
      }),
      selectSelectedLineId: vi.fn(() => state.selectedLineId),
      setSelectedLineId: vi.fn(({ selectedLineId }) => {
        state.selectedLineId = selectedLineId;
      }),
      selectScene: vi.fn(() => ({ sections: [] })),
    };
    const deps = {
      store,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
      appService: {
        getPayload: vi.fn(() => state.payload),
        setPayload: vi.fn((payload) => {
          state.payload = payload;
        }),
      },
    };

    handleSelectedLineChanged(deps, {
      _event: {
        currentTarget: {
          dataset: {
            sectionId: "section-2",
          },
        },
        detail: {
          lineId: "line-3",
        },
      },
    });

    expect(state.selectedSectionId).toBe("section-2");
    expect(state.selectedLineId).toBe("line-3");
    expect(state.payload).toMatchObject({
      sectionId: "section-2",
      lineId: "line-3",
    });
    expect(deps.render).toHaveBeenCalledOnce();
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      expect.objectContaining({ skipRender: true }),
    );
  });

  it("moves block selection from the last line to the next section first line", () => {
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const state = {
        selectedSectionId: "section-1",
        selectedLineId: "line-2",
        payload: {
          sceneId: "scene-1",
          sectionId: "section-1",
          lineId: "line-2",
        },
      };
      const nextSectionEditor = {
        dataset: { sectionId: "section-2" },
        focusContainer: vi.fn(),
        scrollLineIntoView: vi.fn(),
      };
      const store = {
        selectSelectedSectionId: vi.fn(() => state.selectedSectionId),
        setSelectedSectionId: vi.fn(({ selectedSectionId }) => {
          state.selectedSectionId = selectedSectionId;
        }),
        selectSelectedLineId: vi.fn(() => state.selectedLineId),
        setSelectedLineId: vi.fn(({ selectedLineId }) => {
          state.selectedLineId = selectedLineId;
        }),
        selectScene: vi.fn(() => ({
          sections: [
            {
              id: "section-1",
              lines: [{ id: "line-1" }, { id: "line-2" }],
            },
            {
              id: "section-2",
              lines: [{ id: "line-3" }, { id: "line-4" }],
            },
          ],
        })),
      };
      const deps = {
        store,
        refs: {
          sectionEditor0: {
            dataset: { sectionId: "section-1" },
            focusContainer: vi.fn(),
            scrollLineIntoView: vi.fn(),
          },
          sectionEditor1: nextSectionEditor,
        },
        render: vi.fn(),
        subject: {
          dispatch: vi.fn(),
        },
        appService: {
          getPayload: vi.fn(() => state.payload),
          setPayload: vi.fn((payload) => {
            state.payload = payload;
          }),
        },
      };

      handleSelectedLineChanged(deps, {
        _event: {
          currentTarget: {
            dataset: {
              sectionId: "section-1",
            },
          },
          detail: {
            lineId: "line-2",
            mode: "block",
            navigationDirection: "down",
          },
        },
      });

      expect(state.selectedSectionId).toBe("section-2");
      expect(state.selectedLineId).toBe("line-3");
      expect(state.payload).toMatchObject({
        sectionId: "section-2",
        lineId: "line-3",
      });
      expect(deps.render).toHaveBeenCalledOnce();
      expect(nextSectionEditor.scrollLineIntoView).toHaveBeenCalledWith({
        lineId: "line-3",
      });
      expect(nextSectionEditor.focusContainer).toHaveBeenCalled();
      expect(deps.subject.dispatch).toHaveBeenCalledWith(
        "sceneEditor.renderCanvas",
        expect.objectContaining({
          skipRender: true,
          syncPresentationState: true,
        }),
      );
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
    }
  });

  it("moves block selection from the first line to the previous section last line", () => {
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = vi.fn((callback) => {
      callback();
      return 1;
    });

    try {
      const state = {
        selectedSectionId: "section-2",
        selectedLineId: "line-3",
        payload: {
          sceneId: "scene-1",
          sectionId: "section-2",
          lineId: "line-3",
        },
      };
      const previousSectionEditor = {
        dataset: { sectionId: "section-1" },
        focusContainer: vi.fn(),
        scrollLineIntoView: vi.fn(),
      };
      const store = {
        selectSelectedSectionId: vi.fn(() => state.selectedSectionId),
        setSelectedSectionId: vi.fn(({ selectedSectionId }) => {
          state.selectedSectionId = selectedSectionId;
        }),
        selectSelectedLineId: vi.fn(() => state.selectedLineId),
        setSelectedLineId: vi.fn(({ selectedLineId }) => {
          state.selectedLineId = selectedLineId;
        }),
        selectScene: vi.fn(() => ({
          sections: [
            {
              id: "section-1",
              lines: [{ id: "line-1" }, { id: "line-2" }],
            },
            {
              id: "section-2",
              lines: [{ id: "line-3" }, { id: "line-4" }],
            },
          ],
        })),
      };
      const deps = {
        store,
        refs: {
          sectionEditor0: previousSectionEditor,
          sectionEditor1: {
            dataset: { sectionId: "section-2" },
            focusContainer: vi.fn(),
            scrollLineIntoView: vi.fn(),
          },
        },
        render: vi.fn(),
        subject: {
          dispatch: vi.fn(),
        },
        appService: {
          getPayload: vi.fn(() => state.payload),
          setPayload: vi.fn((payload) => {
            state.payload = payload;
          }),
        },
      };

      handleSelectedLineChanged(deps, {
        _event: {
          currentTarget: {
            dataset: {
              sectionId: "section-2",
            },
          },
          detail: {
            lineId: "line-3",
            mode: "block",
            navigationDirection: "up",
          },
        },
      });

      expect(state.selectedSectionId).toBe("section-1");
      expect(state.selectedLineId).toBe("line-2");
      expect(state.payload).toMatchObject({
        sectionId: "section-1",
        lineId: "line-2",
      });
      expect(deps.render).toHaveBeenCalledOnce();
      expect(previousSectionEditor.scrollLineIntoView).toHaveBeenCalledWith({
        lineId: "line-2",
      });
      expect(previousSectionEditor.focusContainer).toHaveBeenCalled();
      expect(deps.subject.dispatch).toHaveBeenCalledWith(
        "sceneEditor.renderCanvas",
        expect.objectContaining({
          skipRender: true,
          syncPresentationState: true,
        }),
      );
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
    }
  });

  it("opens section create dialog with below placement from the section menu", async () => {
    const store = {
      selectDropdownMenu: vi.fn(() => ({
        sectionId: "section-1",
      })),
      hideDropdownMenu: vi.fn(),
      selectScene: vi.fn(() => ({
        sections: [{ id: "section-1" }, { id: "section-2" }],
      })),
      showSectionCreateDialog: vi.fn(),
      selectSceneId: vi.fn(() => "scene-1"),
    };
    const deps = {
      store,
      render: vi.fn(),
      projectService: {},
      subject: {
        dispatch: vi.fn(),
      },
      appService: {},
    };

    await handleDropdownMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "add-section-below",
          },
        },
      },
    });

    expect(store.hideDropdownMenu).toHaveBeenCalledOnce();
    expect(store.showSectionCreateDialog).toHaveBeenCalledWith({
      defaultName: "Section 3",
      placementPosition: "after",
      placementTargetSectionId: "section-1",
    });
    expect(deps.render).toHaveBeenCalledOnce();
  });
});
