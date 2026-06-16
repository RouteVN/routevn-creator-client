import { describe, expect, it, vi } from "vitest";
import {
  applyBackgroundTransformKeyboardPositionChange,
  applyBackgroundTransformResizeChange,
  handleActionsDialogClose,
  handleActionTransformCustomize,
  handleBackgroundTransformCustomize,
  handleBackgroundTransformEditorCancel,
  handleBackgroundTransformEditorCloseClick,
  handleBackgroundTransformEditorKeyDown,
  handleCommandLineSubmit,
  handleDropdownMenuClickItem,
  handleEditorBlur,
  handleNewLine,
  handleSectionMoveSceneFormActionClick,
  handleSelectedLineChanged,
  handleTemporaryPresentationStateChange,
  scrollEntrySelectionIntoView,
} from "../../src/pages/sceneEditorLexical/sceneEditorLexical.handlers.js";

const installAnimationFrameQueue = () => {
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const callbacks = [];
  globalThis.requestAnimationFrame = vi.fn((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });

  return {
    callbacks,
    restore() {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
    },
  };
};

describe("sceneEditorLexical.handlers temporary presentation preview", () => {
  it("renders temporary action previews with animations enabled", () => {
    const stopPropagation = vi.fn();
    const store = {
      setTemporaryPresentationState: vi.fn(),
    };
    const subject = {
      dispatch: vi.fn(),
    };

    handleTemporaryPresentationStateChange(
      {
        store,
        subject,
      },
      {
        _event: {
          stopPropagation,
          detail: {
            presentationState: {
              character: {
                items: [
                  {
                    id: "character-hero",
                    sprites: [
                      {
                        id: "face",
                        resourceId: "sprite-blink",
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(store.setTemporaryPresentationState).toHaveBeenCalledWith({
      presentationState: {
        character: {
          items: [
            {
              id: "character-hero",
              sprites: [
                {
                  id: "face",
                  resourceId: "sprite-blink",
                },
              ],
            },
          ],
        },
      },
    });
    expect(subject.dispatch).toHaveBeenCalledWith("sceneEditor.renderCanvas", {
      skipRender: true,
      skipAnimations: false,
    });
  });
});

describe("sceneEditorLexical.handlers transform editor resize", () => {
  it("resets stale section scroll when entering the first section", () => {
    const scrollContainer = {
      id: "sceneEditorSectionsScroll",
      scrollTop: 420,
      scrollLeft: 0,
      style: {
        scrollBehavior: "smooth",
      },
      scrollTo: vi.fn(({ top }) => {
        scrollContainer.scrollTop = top;
      }),
    };
    const deps = {
      refs: {
        sceneEditorSectionsScroll: scrollContainer,
      },
      store: {
        selectSelectedSectionId: vi.fn(() => "section-1"),
        selectScene: vi.fn(() => ({
          sections: [
            {
              id: "section-1",
            },
          ],
        })),
      },
    };

    scrollEntrySelectionIntoView(deps);

    expect(scrollContainer.scrollTop).toBe(0);
    expect(scrollContainer.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
    expect(scrollContainer.style.scrollBehavior).toBe("smooth");
  });

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

  it("nudges transform position with arrow keys", () => {
    const transform = {
      x: 100,
      y: 120,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      originX: 960,
      originY: 540,
    };

    expect(
      applyBackgroundTransformKeyboardPositionChange({
        transform,
        key: "ArrowUp",
      }),
    ).toMatchObject({
      x: 100,
      y: 119,
    });
    expect(
      applyBackgroundTransformKeyboardPositionChange({
        transform,
        key: "ArrowRight",
        unit: 10,
      }),
    ).toMatchObject({
      x: 110,
      y: 120,
    });
  });

  it("captures arrow keys while the transform editor is open", () => {
    const event = {
      key: "ArrowDown",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    const setBackgroundTransformEditorTransform = vi.fn();
    const deps = {
      store: {
        selectIsBackgroundTransformEditorOpen: vi.fn(() => true),
        selectBackgroundTransformEditor: vi.fn(() => ({
          transform: {
            x: 100,
            y: 120,
            anchorX: 0.5,
            anchorY: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            originX: 960,
            originY: 540,
          },
        })),
        clearBackgroundTransformEditorDragStartPosition: vi.fn(),
        setBackgroundTransformEditorTransform,
      },
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    const didHandle = handleBackgroundTransformEditorKeyDown(deps, event);

    expect(didHandle).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(setBackgroundTransformEditorTransform).toHaveBeenCalledWith({
      transform: expect.objectContaining({
        x: 100,
        y: 121,
      }),
    });
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      {
        skipRender: true,
        skipAnimations: true,
        skipAudio: true,
      },
    );
  });
});

describe("sceneEditorLexical.handlers actions dialog", () => {
  it("opens the background transform editor from the predefined transform when stale inline fields are present", () => {
    const openBackgroundTransformEditor = vi.fn();
    const open = vi.fn();

    handleBackgroundTransformCustomize(
      {
        store: {
          selectRepositoryState: vi.fn(() => ({
            project: {
              resolution: {
                width: 1920,
                height: 1080,
              },
            },
            images: {
              items: {
                "bg-school": {
                  id: "bg-school",
                  width: 1920,
                  height: 1080,
                },
              },
            },
            transforms: {
              items: {
                "bg-center": {
                  id: "bg-center",
                  type: "transform",
                  x: 100,
                  y: 120,
                  anchorX: 0.5,
                  anchorY: 0.5,
                  scaleX: 1,
                  scaleY: 1,
                  rotation: 0,
                },
              },
            },
          })),
          selectSelectedLine: vi.fn(() => ({
            actions: {},
          })),
          setTemporaryPresentationState: vi.fn(),
          openBackgroundTransformEditor,
        },
        refs: {
          systemActions: {
            transformedHandlers: {
              open,
            },
          },
        },
        render: vi.fn(),
        subject: {
          dispatch: vi.fn(),
        },
      },
      {
        _event: {
          stopPropagation: vi.fn(),
          detail: {
            background: {
              resourceId: "bg-school",
              transformId: "bg-center",
              x: 1400,
              y: 800,
              anchorX: 0.5,
              anchorY: 0.5,
              scaleX: 1.2,
              scaleY: 1.2,
              rotation: 0,
            },
          },
        },
      },
    );

    expect(openBackgroundTransformEditor).toHaveBeenCalledWith({
      background: {
        resourceId: "bg-school",
        transformId: "bg-center",
        x: 1400,
        y: 800,
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: 1.2,
        scaleY: 1.2,
        rotation: 0,
      },
      transform: expect.objectContaining({
        x: 100,
        y: 120,
        scaleX: 1,
        scaleY: 1,
      }),
    });
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "background",
      }),
    );
  });

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
        setTemporaryPresentationState: vi.fn(),
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
    expect(deps.store.setTemporaryPresentationState).toHaveBeenCalledWith({
      presentationState: {
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

  it("cancels the background transform editor back to the background command line", () => {
    const callOrder = [];
    const open = vi.fn(() => {
      callOrder.push("open");
    });
    let suppressNextClose = false;
    const setTimeoutCalls = [];
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback, delay) => {
        setTimeoutCalls.push({ callback, delay });
        return 1;
      });
    const store = {
      selectSelectedLine: vi.fn(() => ({
        actions: {
          dialogue: {
            content: "line text",
          },
        },
      })),
      selectBackgroundTransformEditor: vi.fn(() => ({
        targetType: "background",
        background: {
          resourceId: "bg-school",
          transformId: "bg-center",
        },
        transform: {
          x: 1400,
          y: 800,
        },
      })),
      closeBackgroundTransformEditor: vi.fn(),
      suppressNextActionsDialogClose: vi.fn(() => {
        suppressNextClose = true;
      }),
      selectSuppressNextActionsDialogClose: vi.fn(() => suppressNextClose),
      clearSuppressNextActionsDialogClose: vi.fn(() => {
        suppressNextClose = false;
      }),
      selectActionTargetLineId: vi.fn(),
      clearActionTargetLineId: vi.fn(),
      clearTemporaryPresentationState: vi.fn(),
      setTemporaryPresentationState: vi.fn(),
    };
    const deps = {
      store,
      refs: {
        systemActions: {
          transformedHandlers: {
            open,
          },
        },
      },
      render: vi.fn(() => {
        callOrder.push("render");
      }),
      subject: {
        dispatch: vi.fn(),
      },
    };
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };

    try {
      handleBackgroundTransformEditorCancel(deps, {
        _event: event,
      });

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
      expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
      expect(store.suppressNextActionsDialogClose).toHaveBeenCalledTimes(1);
      expect(store.closeBackgroundTransformEditor).toHaveBeenCalledTimes(1);
      expect(store.clearSuppressNextActionsDialogClose).not.toHaveBeenCalled();
      expect(store.clearTemporaryPresentationState).not.toHaveBeenCalled();
      expect(store.setTemporaryPresentationState).toHaveBeenCalledWith({
        presentationState: {
          background: {
            resourceId: "bg-school",
            transformId: "bg-center",
          },
        },
      });
      expect(open).toHaveBeenCalledWith({
        mode: "background",
        actions: {
          dialogue: {
            content: "line text",
          },
          background: {
            resourceId: "bg-school",
            transformId: "bg-center",
          },
        },
      });
      expect(deps.render).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["render", "open"]);
      expect(deps.subject.dispatch).toHaveBeenCalledWith(
        "sceneEditor.renderCanvas",
        {
          skipRender: true,
          skipAnimations: true,
        },
      );
      expect(setTimeoutCalls).toHaveLength(1);
      expect(setTimeoutCalls[0].delay).toBe(50);

      handleActionsDialogClose(deps);

      expect(store.clearSuppressNextActionsDialogClose).toHaveBeenCalledTimes(
        1,
      );
      expect(store.clearTemporaryPresentationState).not.toHaveBeenCalled();
      expect(deps.render).toHaveBeenCalledTimes(1);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("cancels an action transform editor back to the owning command line", () => {
    const callOrder = [];
    const open = vi.fn(() => {
      callOrder.push("open");
    });
    let suppressNextClose = false;
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(() => 1);
    const selectedLineVisualAction = {
      items: [
        {
          id: "stale-visual",
          resourceId: "old-image",
          transformId: "old-preset",
        },
      ],
    };
    const editorVisualAction = {
      items: [
        {
          id: "visual-1",
          resourceId: "image-1",
          transformId: "preset",
        },
        {
          id: "visual-2",
          resourceId: "image-2",
          transformId: "preset",
        },
      ],
    };
    const store = {
      selectSelectedLine: vi.fn(() => ({
        actions: {
          visual: selectedLineVisualAction,
        },
      })),
      selectBackgroundTransformEditor: vi.fn(() => ({
        targetType: "visual",
        actionKey: "visual",
        action: editorVisualAction,
        itemIndex: 0,
        item: editorVisualAction.items[0],
        transform: {
          x: 1400,
          y: 800,
        },
      })),
      closeBackgroundTransformEditor: vi.fn(),
      suppressNextActionsDialogClose: vi.fn(() => {
        suppressNextClose = true;
      }),
      selectSuppressNextActionsDialogClose: vi.fn(() => suppressNextClose),
      clearSuppressNextActionsDialogClose: vi.fn(() => {
        suppressNextClose = false;
      }),
      setTemporaryPresentationState: vi.fn(),
    };
    const deps = {
      store,
      refs: {
        systemActions: {
          transformedHandlers: {
            open,
          },
        },
      },
      render: vi.fn(() => {
        callOrder.push("render");
      }),
      subject: {
        dispatch: vi.fn(),
      },
    };

    try {
      handleBackgroundTransformEditorCancel(deps);

      expect(store.suppressNextActionsDialogClose).toHaveBeenCalledTimes(1);
      expect(store.closeBackgroundTransformEditor).toHaveBeenCalledTimes(1);
      expect(store.setTemporaryPresentationState).toHaveBeenCalledWith({
        presentationState: {
          visual: editorVisualAction,
        },
      });
      expect(open).toHaveBeenCalledWith({
        mode: "visual",
        actions: {
          visual: editorVisualAction,
        },
      });
      expect(deps.subject.dispatch).toHaveBeenCalledWith(
        "sceneEditor.renderCanvas",
        {
          skipRender: true,
          skipAnimations: true,
        },
      );
      expect(deps.render).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["render", "open"]);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("saves an action transform back into the owning command line snapshot", () => {
    const handleSetActionCustomTransform = vi.fn();
    const open = vi.fn();
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation((callback) => {
        callback();
        return 1;
      });
    const editorVisualAction = {
      items: [
        {
          id: "visual-1",
          resourceId: "image-1",
          transformId: "preset",
        },
        {
          id: "visual-2",
          resourceId: "image-2",
          transformId: "preset",
        },
      ],
    };
    const store = {
      selectSelectedLine: vi.fn(() => ({
        actions: {
          visual: {
            items: [
              {
                id: "stale-visual",
                resourceId: "old-image",
                transformId: "old-preset",
              },
            ],
          },
        },
      })),
      selectBackgroundTransformEditor: vi.fn(() => ({
        targetType: "visual",
        actionKey: "visual",
        action: editorVisualAction,
        itemIndex: 0,
        item: editorVisualAction.items[0],
        transform: {
          x: 1400,
          y: 800,
        },
      })),
      closeBackgroundTransformEditor: vi.fn(),
      suppressNextActionsDialogClose: vi.fn(),
      clearSuppressNextActionsDialogClose: vi.fn(),
    };
    const deps = {
      store,
      refs: {
        systemActions: {
          transformedHandlers: {
            handleSetActionCustomTransform,
            open,
          },
        },
      },
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    try {
      handleBackgroundTransformEditorCloseClick(deps, {
        _event: {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          stopImmediatePropagation: vi.fn(),
        },
      });

      expect(handleSetActionCustomTransform).toHaveBeenCalledWith({
        targetType: "visual",
        itemIndex: 0,
        item: editorVisualAction.items[0],
        transform: {
          x: 1400,
          y: 800,
        },
      });
      expect(open).toHaveBeenCalledWith({
        mode: "visual",
        actions: {
          visual: {
            items: [
              {
                id: "visual-1",
                resourceId: "image-1",
                transformId: "preset",
                x: 1400,
                y: 800,
                anchorX: 0.5,
                anchorY: 0.5,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                originX: 0,
                originY: 0,
              },
              editorVisualAction.items[1],
            ],
          },
        },
      });
      expect(deps.store.closeBackgroundTransformEditor).toHaveBeenCalledTimes(
        1,
      );
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("stores the full action snapshot when opening an action transform editor", () => {
    const action = {
      items: [
        {
          id: "visual-1",
          resourceId: "image-1",
          transformId: "preset",
        },
      ],
    };
    const openBackgroundTransformEditor = vi.fn();
    const open = vi.fn();
    const store = {
      setTemporaryPresentationState: vi.fn(),
      openBackgroundTransformEditor,
      selectRepositoryState: vi.fn(() => ({
        project: {
          resolution: {
            width: 1920,
            height: 1080,
          },
        },
        images: {
          items: {
            "image-1": {
              id: "image-1",
              width: 1920,
              height: 1080,
            },
          },
        },
      })),
      selectSelectedLine: vi.fn(() => ({
        actions: {
          visual: {
            items: [],
          },
        },
      })),
    };
    const deps = {
      store,
      refs: {
        systemActions: {
          transformedHandlers: {
            open,
          },
        },
      },
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    handleActionTransformCustomize(deps, {
      _event: {
        stopPropagation: vi.fn(),
        detail: {
          targetType: "visual",
          actionKey: "visual",
          itemIndex: 0,
          item: action.items[0],
          action,
        },
      },
    });

    expect(openBackgroundTransformEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "visual",
        actionKey: "visual",
        action,
        itemIndex: 0,
        item: action.items[0],
      }),
    );
    expect(open).toHaveBeenCalledWith({
      mode: "visual",
      actions: {
        visual: action,
      },
    });
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
        preserveAnimationPlayback: true,
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
        preserveAnimationPlayback: true,
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
    expect(deps.appService.setPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: "section-2",
        lineId: "line-3",
      }),
      { throttleMs: 250 },
    );
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
      expect(deps.appService.setPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: "section-2",
          lineId: "line-3",
        }),
        { throttleMs: 250 },
      );
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
      expect(deps.appService.setPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: "section-1",
          lineId: "line-2",
        }),
        { throttleMs: 250 },
      );
      expect(deps.render).toHaveBeenCalledOnce();
      expect(previousSectionEditor.scrollLineIntoView).toHaveBeenCalledWith({
        lineId: "line-2",
      });
      expect(previousSectionEditor.focusContainer).toHaveBeenCalled();
      expect(deps.subject.dispatch).toHaveBeenCalledWith(
        "sceneEditor.renderCanvas",
        expect.objectContaining({
          preserveAnimationPlayback: true,
          skipAnimations: true,
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

  it("moves text selection from the last line to the next section first line", () => {
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
        focusLine: vi.fn(),
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
            focusLine: vi.fn(),
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
            mode: "text-editor",
            cursorPosition: 6,
            navigationDirection: "down",
            isBoundaryNavigation: true,
          },
        },
      });

      expect(state.selectedSectionId).toBe("section-2");
      expect(state.selectedLineId).toBe("line-3");
      expect(state.payload).toMatchObject({
        sectionId: "section-2",
        lineId: "line-3",
      });
      expect(nextSectionEditor.scrollLineIntoView).toHaveBeenCalledWith({
        lineId: "line-3",
      });
      expect(nextSectionEditor.focusLine).toHaveBeenCalledWith({
        sectionId: "section-2",
        lineId: "line-3",
        cursorPosition: 6,
        goalColumn: 6,
        direction: "down",
      });
      expect(deps.render).toHaveBeenCalledOnce();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
    }
  });

  it("does not focus a stale text boundary target after selection changes before the frame", () => {
    const animationFrame = installAnimationFrameQueue();

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
        focusLine: vi.fn(),
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
            focusLine: vi.fn(),
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
            mode: "text-editor",
            cursorPosition: 6,
            navigationDirection: "down",
            isBoundaryNavigation: true,
          },
        },
      });

      expect(state.selectedSectionId).toBe("section-2");
      expect(state.selectedLineId).toBe("line-3");

      state.selectedSectionId = "section-1";
      state.selectedLineId = "line-1";
      animationFrame.callbacks.shift()();

      expect(nextSectionEditor.scrollLineIntoView).not.toHaveBeenCalled();
      expect(nextSectionEditor.focusLine).not.toHaveBeenCalled();
    } finally {
      animationFrame.restore();
    }
  });

  it("moves text selection from the first line to the previous section last line", () => {
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
        focusLine: vi.fn(),
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
            focusLine: vi.fn(),
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
            mode: "text-editor",
            cursorPosition: 4,
            navigationDirection: "up",
            isBoundaryNavigation: true,
          },
        },
      });

      expect(state.selectedSectionId).toBe("section-1");
      expect(state.selectedLineId).toBe("line-2");
      expect(state.payload).toMatchObject({
        sectionId: "section-1",
        lineId: "line-2",
      });
      expect(previousSectionEditor.scrollLineIntoView).toHaveBeenCalledWith({
        lineId: "line-2",
      });
      expect(previousSectionEditor.focusLine).toHaveBeenCalledWith({
        sectionId: "section-1",
        lineId: "line-2",
        cursorPosition: 4,
        goalColumn: 4,
        direction: "up",
      });
      expect(deps.render).toHaveBeenCalledOnce();
    } finally {
      if (previousRequestAnimationFrame === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = previousRequestAnimationFrame;
      }
    }
  });

  it("closes the section dropdown before showing a delete validation alert", async () => {
    const store = {
      selectDropdownMenu: vi.fn(() => ({
        sectionId: "section-1",
      })),
      hideDropdownMenu: vi.fn(),
      selectSceneId: vi.fn(() => "scene-1"),
      selectSelectedSectionId: vi.fn(() => "section-1"),
      selectDraftSaveTimerId: vi.fn(() => undefined),
      selectDraftSectionBySectionId: vi.fn(() => ({
        sceneId: "scene-1",
        sectionId: "section-1",
        dirty: false,
        lines: [],
      })),
      selectPendingDraftSections: vi.fn(() => []),
      setDraftSavePendingSinceAt: vi.fn(),
    };
    const render = vi.fn();
    const showAlert = vi.fn();
    const deps = {
      store,
      render,
      refs: {},
      projectService: {
        deleteSectionItem: vi.fn(async () => ({
          valid: false,
          error: {
            message:
              "This section can't be deleted because another section references it.",
          },
        })),
      },
      subject: {
        dispatch: vi.fn(),
      },
      appService: {
        showAlert,
      },
    };

    await expect(
      handleDropdownMenuClickItem(deps, {
        _event: {
          detail: {
            item: {
              value: "delete-section",
            },
          },
        },
      }),
    ).rejects.toThrow(
      "This section can't be deleted because another section references it.",
    );

    expect(store.hideDropdownMenu).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith({
      message:
        "This section can't be deleted because another section references it.",
      title: "Error",
    });
    expect(render.mock.invocationCallOrder[0]).toBeLessThan(
      showAlert.mock.invocationCallOrder[0],
    );
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
