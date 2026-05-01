import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectAction,
  updateActions,
} from "../../src/components/systemActions/systemActions.store.js";
import {
  handleActionsDialogClose,
  handleEmbeddedCloseClick,
  handleCommandLineSubmit,
  handleTemporaryPresentationStateChange,
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
});
