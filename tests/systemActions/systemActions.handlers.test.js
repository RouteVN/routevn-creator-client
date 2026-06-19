import { describe, expect, it, vi } from "vitest";
import {
  closeAudioPlayer,
  createInitialState,
  openAudioPlayer,
  selectVoicePreview,
  selectAction,
  setRepositoryState,
  updateActions,
} from "../../src/components/systemActions/systemActions.store.js";
import {
  handleActionsDialogClose,
  handleActionsDialogCloseRequest,
  handleBackgroundTransformCustomize,
  handleBackgroundTransformEditorDone,
  handleGetBackgroundTransformPreviewCanvasRoot,
  handleAudioPlayerClose,
  handleEmbeddedCloseClick,
  handleOnUpdate,
  handleCommandLineSubmit,
  handleTemporaryPresentationStateChange,
  handleVoicePreviewClick,
  handleSetBackgroundCustomTransform,
  handleSetActionCustomTransform,
  open,
} from "../../src/components/systemActions/systemActions.handlers.js";

describe("systemActions.handlers", () => {
  it("keeps local merged actions but emits only the submitted action delta", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const stopPropagation = () => {};

    updateActions(
      { state },
      {
        toggleAutoMode: {},
      },
    );

    const deps = {
      store: {
        selectAction: () => selectAction({ state }),
        updateActions: (payload) => updateActions({ state }, payload),
        hideActionsDialog: () => {},
      },
      render: () => {},
      dispatchEvent: (event) => {
        dispatchedEvents.push(event);
      },
    };

    handleCommandLineSubmit(deps, {
      _event: {
        stopPropagation,
        detail: {
          toggleSkipMode: {},
        },
      },
    });

    expect(selectAction({ state })).toEqual({
      toggleAutoMode: {},
      toggleSkipMode: {},
    });
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("actions-change");
    expect(dispatchedEvents[0].detail).toEqual({
      toggleSkipMode: {},
    });
  });

  it("does not leak stale dialogue content when submitting an unrelated action", () => {
    const state = createInitialState();
    const dispatchedEvents = [];

    updateActions(
      { state },
      {
        dialogue: {
          content: [{ text: "stale draft text" }],
        },
      },
    );

    const deps = {
      store: {
        selectAction: () => selectAction({ state }),
        updateActions: (payload) => updateActions({ state }, payload),
        hideActionsDialog: () => {},
      },
      render: () => {},
      dispatchEvent: (event) => {
        dispatchedEvents.push(event);
      },
    };

    handleCommandLineSubmit(deps, {
      _event: {
        stopPropagation: () => {},
        detail: {
          background: {
            resourceId: "bg-1",
          },
        },
      },
    });

    expect(selectAction({ state })).toEqual({
      dialogue: {
        content: [{ text: "stale draft text" }],
      },
      background: {
        resourceId: "bg-1",
      },
    });
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].detail).toEqual({
      background: {
        resourceId: "bg-1",
      },
    });
  });

  it("emits dialogue character sprite data in the submitted action delta", () => {
    const state = createInitialState();
    const dispatchedEvents = [];

    const deps = {
      store: {
        selectAction: () => selectAction({ state }),
        updateActions: (payload) => updateActions({ state }, payload),
        hideActionsDialog: () => {},
      },
      render: () => {},
      dispatchEvent: (event) => {
        dispatchedEvents.push(event);
      },
    };

    handleCommandLineSubmit(deps, {
      _event: {
        stopPropagation: () => {},
        detail: {
          dialogue: {
            mode: "adv",
            characterId: "character-1",
            character: {
              sprite: {
                transformId: "portrait-left",
                items: [{ id: "body", resourceId: "sprite-body" }],
                animations: {
                  resourceId: "portrait-in",
                },
              },
            },
          },
        },
      },
    });

    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].detail).toEqual({
      dialogue: {
        mode: "adv",
        characterId: "character-1",
        character: {
          sprite: {
            transformId: "portrait-left",
            items: [{ id: "body", resourceId: "sprite-body" }],
            animations: {
              resourceId: "portrait-in",
            },
          },
        },
      },
    });
  });

  it("stops nested submit events from leaking to outer action editors", () => {
    const state = createInitialState();
    let stopPropagationCalled = false;

    const deps = {
      store: {
        selectAction: () => selectAction({ state }),
        updateActions: (payload) => updateActions({ state }, payload),
        hideActionsDialog: () => {},
      },
      render: () => {},
      dispatchEvent: () => {},
    };

    handleCommandLineSubmit(deps, {
      _event: {
        stopPropagation: () => {
          stopPropagationCalled = true;
        },
        detail: {
          updateVariable: {
            id: "updateVariable1",
            operations: [],
          },
        },
      },
    });

    expect(stopPropagationCalled).toBe(true);
    expect(selectAction({ state })).toEqual({
      updateVariable: {
        id: "updateVariable1",
        operations: [],
      },
    });
  });

  it("forwards temporary presentation state changes from action editors", () => {
    const dispatchedEvents = [];
    let stopPropagationCalled = false;

    handleTemporaryPresentationStateChange(
      {
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {
            stopPropagationCalled = true;
          },
          detail: {
            presentationState: {
              dialogue: {
                mode: "adv",
              },
            },
          },
        },
      },
    );

    expect(stopPropagationCalled).toBe(true);
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchedEvents[0].detail).toEqual({
      presentationState: {
        dialogue: {
          mode: "adv",
        },
      },
    });
  });

  it("keeps the background command editor open when applying a custom transform", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const setChildCustomTransform = vi.fn();
    const updateActionsSpy = vi.fn();
    const render = vi.fn();

    updateActions(
      { state },
      {
        background: {
          resourceId: "bg-school",
          transformId: "bg-center",
        },
      },
    );

    handleSetBackgroundCustomTransform(
      {
        refs: {
          commandLineBackground: {
            transformedHandlers: {
              handleSetCustomTransform: setChildCustomTransform,
            },
          },
        },
        store: {
          selectAction: () => selectAction({ state }),
          updateActions: updateActionsSpy,
        },
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        background: {
          resourceId: "bg-school",
          transformId: "bg-center",
        },
        transform: {
          x: 100,
          y: 120,
          anchorX: 0,
          anchorY: 1,
          scaleX: 1.2,
          scaleY: 1.2,
          rotation: -8,
          originX: 64,
          originY: 128,
        },
      },
    );

    const nextBackground = {
      resourceId: "bg-school",
      x: 100,
      y: 120,
      anchorX: 0,
      anchorY: 1,
      scaleX: 1.2,
      scaleY: 1.2,
      rotation: -8,
      originX: 64,
      originY: 128,
    };

    expect(selectAction({ state }).background).toEqual({
      resourceId: "bg-school",
      transformId: "bg-center",
    });
    expect(updateActionsSpy).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(setChildCustomTransform).toHaveBeenCalledWith({
      transform: nextBackground,
    });
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchedEvents[0].detail).toEqual({
      presentationState: {
        background: nextBackground,
      },
    });
  });

  it("uses the transform editor action snapshot when applying a visual custom transform", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const setChildCustomTransform = vi.fn();
    const transform = {
      x: 320,
      y: 180,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: 1.4,
      scaleY: 1.4,
      rotation: 12,
      originX: 100,
      originY: 80,
    };
    const staleAction = {
      items: [
        {
          id: "visual-1",
          resourceId: "image-1",
          transformId: "center",
        },
      ],
    };
    const editorAction = {
      items: [
        {
          id: "visual-1",
          resourceId: "image-1",
          transformId: "center",
        },
        {
          id: "visual-2",
          resourceId: "image-2",
          transformId: "center",
        },
      ],
    };

    updateActions(
      { state },
      {
        visual: staleAction,
      },
    );

    handleSetActionCustomTransform(
      {
        refs: {
          commandLineVisual: {
            transformedHandlers: {
              handleSetCustomTransform: setChildCustomTransform,
            },
          },
        },
        store: {
          selectAction: () => selectAction({ state }),
        },
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        targetType: "visual",
        itemIndex: 1,
        item: editorAction.items[1],
        transform,
        action: editorAction,
      },
    );

    expect(setChildCustomTransform).toHaveBeenCalledWith({
      index: 1,
      transform,
    });
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].detail.presentationState.visual.items).toEqual([
      editorAction.items[0],
      {
        ...editorAction.items[1],
        ...transform,
      },
    ]);
  });

  it("emits close from embedded system action editors", () => {
    const dispatchedEvents = [];
    let stopPropagationCalled = false;

    handleEmbeddedCloseClick(
      {
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {
            stopPropagationCalled = true;
          },
        },
      },
    );

    expect(stopPropagationCalled).toBe(true);
    expect(dispatchedEvents).toHaveLength(2);
    expect(dispatchedEvents[0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchedEvents[0].detail).toEqual({
      presentationState: {},
    });
    expect(dispatchedEvents[1].type).toBe("close");
  });

  it("ignores dialog close while close is suppressed by a transform editor", () => {
    const dispatchedEvents = [];
    const state = createInitialState();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    const deps = {
      props: {
        suppressDialogClose: true,
      },
      store: {
        hideActionsDialog: vi.fn(() => {
          state.isActionsDialogOpen = false;
        }),
        setMode: vi.fn(({ mode }) => {
          state.mode = mode;
        }),
      },
      render: vi.fn(),
      dispatchEvent: (event) => {
        dispatchedEvents.push(event);
      },
    };

    state.isActionsDialogOpen = true;
    state.mode = "background";

    handleActionsDialogClose(deps, {
      _event: {
        preventDefault,
        stopPropagation,
      },
    });

    expect(state.isActionsDialogOpen).toBe(true);
    expect(state.mode).toBe("background");
    expect(deps.store.hideActionsDialog).not.toHaveBeenCalled();
    expect(deps.store.setMode).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(dispatchedEvents).toHaveLength(0);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("arms local close suppression before forwarding background transform Customize", () => {
    const dispatchedEvents = [];
    const setSuppressDialogClose = vi.fn();
    const handleSuppressClose = vi.fn();
    const stopPropagation = vi.fn();

    handleBackgroundTransformCustomize(
      {
        refs: {
          actionsDialog: {
            transformedHandlers: {
              handleSuppressClose,
            },
          },
        },
        store: {
          setSuppressDialogClose,
        },
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation,
          detail: {
            background: {
              resourceId: "bg-title",
            },
          },
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(setSuppressDialogClose).toHaveBeenCalledWith({
      suppressDialogClose: true,
    });
    expect(handleSuppressClose).toHaveBeenCalledTimes(1);
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("background-transform-customize");
    expect(dispatchedEvents[0].detail).toEqual({
      background: {
        resourceId: "bg-title",
      },
    });
  });

  it("ignores dialog close while local close suppression is active", () => {
    const dispatchedEvents = [];
    const state = createInitialState();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    const deps = {
      props: {},
      store: {
        selectSuppressDialogClose: vi.fn(() => true),
        hideActionsDialog: vi.fn(() => {
          state.isActionsDialogOpen = false;
        }),
        setMode: vi.fn(({ mode }) => {
          state.mode = mode;
        }),
      },
      render: vi.fn(),
      dispatchEvent: (event) => {
        dispatchedEvents.push(event);
      },
    };

    state.isActionsDialogOpen = true;
    state.mode = "background";

    handleActionsDialogClose(deps, {
      _event: {
        preventDefault,
        stopPropagation,
      },
    });

    expect(state.isActionsDialogOpen).toBe(true);
    expect(state.mode).toBe("background");
    expect(deps.store.hideActionsDialog).not.toHaveBeenCalled();
    expect(deps.store.setMode).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(dispatchedEvents).toHaveLength(0);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });

  it("turns suppressed dialog close requests into transform editor cancel", () => {
    const dispatchedEvents = [];
    const handleCancelBackground = vi.fn();
    const handleCancelCharacters = vi.fn();
    const handleCancelVisual = vi.fn();
    const setSuppressDialogClose = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleActionsDialogCloseRequest(
      {
        props: {
          backgroundTransformEditor: {
            isOpen: true,
          },
        },
        refs: {
          commandLineBackground: {
            transformedHandlers: {
              handleCancelCustomTransformEditor: handleCancelBackground,
            },
          },
          commandLineCharacters: {
            transformedHandlers: {
              handleCancelCustomTransformEditor: handleCancelCharacters,
            },
          },
          commandLineVisual: {
            transformedHandlers: {
              handleCancelCustomTransformEditor: handleCancelVisual,
            },
          },
        },
        store: {
          setSuppressDialogClose,
        },
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(handleCancelBackground).toHaveBeenCalledTimes(1);
    expect(handleCancelCharacters).toHaveBeenCalledTimes(1);
    expect(handleCancelVisual).toHaveBeenCalledTimes(1);
    expect(setSuppressDialogClose).toHaveBeenCalledWith({
      suppressDialogClose: true,
    });
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("background-transform-editor-cancel");
  });

  it("clears temporary presentation state when the actions dialog closes", () => {
    const dispatchedEvents = [];
    const state = createInitialState();

    const deps = {
      store: {
        hideActionsDialog: () => {
          state.isActionsDialogOpen = false;
        },
        setMode: ({ mode }) => {
          state.mode = mode;
        },
      },
      render: () => {},
      dispatchEvent: (event) => {
        dispatchedEvents.push(event);
      },
    };

    state.isActionsDialogOpen = true;
    state.mode = "dialogue";

    handleActionsDialogClose(deps);

    expect(state.isActionsDialogOpen).toBe(false);
    expect(dispatchedEvents).toHaveLength(2);
    expect(dispatchedEvents[0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchedEvents[0].detail).toEqual({
      presentationState: {},
    });
    expect(dispatchedEvents[1].type).toBe("close");
  });

  it("resyncs local actions from props when opened", () => {
    const state = createInitialState();

    updateActions(
      { state },
      {
        toggleSkipMode: {},
      },
    );

    const deps = {
      props: {
        actions: {
          pushOverlay: {
            resourceId: "layout-settings",
          },
        },
      },
      store: {
        updateActions: (payload) => updateActions({ state }, payload),
        showActionsDialog: () => {},
        setMode: () => {},
      },
      render: () => {},
    };

    open(deps, {
      mode: "actions",
    });

    expect(selectAction({ state })).toEqual({
      pushOverlay: {
        resourceId: "layout-settings",
      },
    });
  });

  it("prefers explicit open actions over stale props actions", () => {
    const state = createInitialState();

    const deps = {
      props: {
        actions: {
          pushOverlay: {
            resourceId: "stale-layout",
          },
        },
      },
      store: {
        updateActions: (payload) => updateActions({ state }, payload),
        showActionsDialog: () => {},
        setMode: () => {},
      },
      render: () => {},
    };

    open(deps, {
      mode: "actions",
      actions: {
        pushOverlay: {
          resourceId: "fresh-layout",
        },
        updateVariable: {
          id: "updateVariable1",
          operations: [],
        },
      },
    });

    expect(selectAction({ state })).toEqual({
      pushOverlay: {
        resourceId: "fresh-layout",
      },
      updateVariable: {
        id: "updateVariable1",
        operations: [],
      },
    });
  });

  it("forwards background transform editor Done from the nested background command line", () => {
    const dispatchedEvents = [];
    const stopPropagation = vi.fn();

    handleBackgroundTransformEditorDone(
      {
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation,
          detail: {
            done: true,
          },
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("background-transform-editor-done");
    expect(dispatchedEvents[0].detail).toEqual({
      done: true,
    });
  });

  it("exposes the nested background command line transform preview canvas root", () => {
    const canvasRoot = {};
    const getCanvasRoot = vi.fn(() => canvasRoot);

    expect(
      handleGetBackgroundTransformPreviewCanvasRoot({
        refs: {
          commandLineBackground: {
            transformedHandlers: {
              handleGetBackgroundTransformPreviewCanvasRoot: getCanvasRoot,
            },
          },
        },
      }),
    ).toBe(canvasRoot);
    expect(getCanvasRoot).toHaveBeenCalledTimes(1);
  });

  it("opens and closes the inline voice preview player", () => {
    const state = createInitialState();
    const props = {
      actions: {
        voice: {
          resourceId: "voice-line-1",
        },
      },
    };
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    updateActions({ state }, props.actions);
    setRepositoryState(
      { state },
      {
        repositoryState: {
          voices: {
            items: {
              "voice-line-1": {
                id: "voice-line-1",
                type: "voice",
                name: "Aki Line 1",
                fileId: "file-voice-line-1",
              },
            },
            tree: [{ id: "voice-line-1" }],
          },
        },
      },
    );

    handleVoicePreviewClick(
      {
        store: {
          selectVoicePreview: () => selectVoicePreview({ state, props }),
          openAudioPlayer: (payload) => openAudioPlayer({ state }, payload),
        },
        render,
      },
      {
        _event: {
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(state.showAudioPlayer).toBe(true);
    expect(state.playingSound).toEqual({
      fileId: "file-voice-line-1",
      title: "Aki Line 1",
    });
    expect(render).toHaveBeenCalledTimes(1);

    handleAudioPlayerClose(
      {
        store: {
          closeAudioPlayer: () => closeAudioPlayer({ state }),
        },
        render,
      },
      {
        _event: {
          stopPropagation,
        },
      },
    );

    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(state.showAudioPlayer).toBe(false);
    expect(state.playingSound).toEqual({
      fileId: undefined,
      title: "",
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("warns when a voice action has no previewable audio file", () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const showAlert = vi.fn();
    const render = vi.fn();

    handleVoicePreviewClick(
      {
        appService: {
          showAlert,
        },
        store: {
          selectVoicePreview: () => ({
            id: "voice-line-1",
            name: "Aki Line 1",
          }),
          openAudioPlayer: vi.fn(),
        },
        render,
      },
      {
        _event: {
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith({
      message: "Voice preview audio is unavailable.",
      title: "Warning",
    });
    expect(render).not.toHaveBeenCalled();
  });

  it("refreshes repository resources when system action props update", () => {
    const state = createInitialState();
    const render = vi.fn();

    handleOnUpdate(
      {
        projectService: {
          getRepositoryState: () => ({
            voices: {
              items: {
                "voice-line-1": {
                  id: "voice-line-1",
                  type: "voice",
                  name: "Aki Line 1",
                  fileId: "file-voice-line-1",
                },
              },
              tree: [{ id: "voice-line-1" }],
            },
          }),
        },
        store: {
          setRepositoryState: (payload) =>
            setRepositoryState({ state }, payload),
          updateActions: (payload) => updateActions({ state }, payload),
        },
        render,
      },
      {
        newProps: {
          actions: {
            voice: {
              resourceId: "voice-line-1",
            },
          },
        },
      },
    );

    expect(selectVoicePreview({ state, props: {} })).toMatchObject({
      id: "voice-line-1",
      name: "Aki Line 1",
      fileId: "file-voice-line-1",
    });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
