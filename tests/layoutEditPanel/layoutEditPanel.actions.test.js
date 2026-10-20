import { describe, expect, it } from "vitest";
import {
  createInitialState,
  setActionsEditorActions,
  setActiveInteractionType,
  setValues,
  syncActionsEditorActions,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  handleActionsChange,
  handleActionsDelete,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";

describe("layoutEditPanel actions", () => {
  it("keeps existing click actions when adding another action", () => {
    const state = createInitialState();

    setValues(
      { state },
      {
        values: {
          click: {
            payload: {
              actions: {
                pushOverlay: {
                  resourceId: "layout-settings",
                },
              },
            },
          },
        },
      },
    );
    setActiveInteractionType(
      { state },
      {
        interactionType: "click",
      },
    );
    syncActionsEditorActions(
      { state },
      {
        interactionType: "click",
      },
    );

    const deps = {
      store: {
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
        selectActiveInteractionType: () => state.activeInteractionType,
        selectValues: () => state.values,
        setActionsEditorActions: (payload) =>
          setActionsEditorActions({ state }, payload),
      },
      render: () => {},
      dispatchEvent: () => {},
    };

    handleActionsChange(deps, {
      _event: {
        detail: {
          setMenuPage: {
            value: "options",
          },
        },
      },
    });

    expect(state.values.click.payload.actions).toEqual({
      pushOverlay: {
        resourceId: "layout-settings",
      },
      setMenuPage: {
        value: "options",
      },
    });
    expect(state.actionsEditorActions).toEqual({
      pushOverlay: {
        resourceId: "layout-settings",
      },
      setMenuPage: {
        value: "options",
      },
    });
  });

  it("keeps existing slider change actions when adding another action", () => {
    const state = createInitialState();

    setValues(
      { state },
      {
        values: {
          change: {
            payload: {
              actions: {
                updateVariable: {
                  operations: [
                    {
                      variableId: "volume",
                      op: "set",
                      value: "_event.value",
                    },
                  ],
                },
              },
            },
          },
        },
      },
    );
    setActiveInteractionType(
      { state },
      {
        interactionType: "change",
      },
    );
    syncActionsEditorActions(
      { state },
      {
        interactionType: "change",
      },
    );

    const deps = {
      store: {
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
        selectActiveInteractionType: () => state.activeInteractionType,
        selectValues: () => state.values,
        setActionsEditorActions: (payload) =>
          setActionsEditorActions({ state }, payload),
      },
      render: () => {},
      dispatchEvent: () => {},
    };

    handleActionsChange(deps, {
      _event: {
        detail: {
          toggleAutoMode: {},
        },
      },
    });

    expect(state.values.change.payload.actions).toEqual({
      updateVariable: {
        operations: [
          {
            variableId: "volume",
            op: "set",
            value: "_event.value",
          },
        ],
      },
      toggleAutoMode: {},
    });
    expect(state.actionsEditorActions).toEqual({
      updateVariable: {
        operations: [
          {
            variableId: "volume",
            op: "set",
            value: "_event.value",
          },
        ],
      },
      toggleAutoMode: {},
    });
  });

  it("keeps existing scroll actions when adding another action", () => {
    const state = createInitialState();

    setValues(
      { state },
      {
        values: {
          scrollDown: {
            payload: {
              actions: {
                sectionTransition: {
                  sectionId: "section-2",
                },
              },
            },
          },
        },
      },
    );
    setActiveInteractionType(
      { state },
      {
        interactionType: "scrollDown",
      },
    );
    syncActionsEditorActions(
      { state },
      {
        interactionType: "scrollDown",
      },
    );

    const deps = {
      store: {
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
        selectActiveInteractionType: () => state.activeInteractionType,
        selectValues: () => state.values,
        setActionsEditorActions: (payload) =>
          setActionsEditorActions({ state }, payload),
      },
      render: () => {},
      dispatchEvent: () => {},
    };

    handleActionsChange(deps, {
      _event: {
        detail: {
          toggleDialogueUI: {},
        },
      },
    });

    expect(state.values.scrollDown.payload.actions).toEqual({
      sectionTransition: {
        sectionId: "section-2",
      },
      toggleDialogueUI: {},
    });
    expect(state.actionsEditorActions).toEqual({
      sectionTransition: {
        sectionId: "section-2",
      },
      toggleDialogueUI: {},
    });
  });
});

describe("layoutEditPanel action delete", () => {
  const createDeps = (actions) => {
    const state = createInitialState();
    const dispatchedEvents = [];
    setValues({ state }, { values: { click: { payload: { actions } } } });
    setActiveInteractionType({ state }, { interactionType: "click" });
    syncActionsEditorActions({ state }, { interactionType: "click" });

    return {
      state,
      dispatchedEvents,
      deps: {
        store: {
          updateValueProperty: (payload) =>
            updateValueProperty({ state }, payload),
          selectActiveInteractionType: () => state.activeInteractionType,
          selectValues: () => state.values,
          setActionsEditorActions: (payload) =>
            setActionsEditorActions({ state }, payload),
        },
        render: () => {},
        dispatchEvent: (event) => dispatchedEvents.push(event),
      },
    };
  };

  it("removes the deleted action from the interaction", () => {
    const { state, dispatchedEvents, deps } = createDeps({
      sectionTransition: { sceneId: "scene-1", sectionId: "section-2" },
      pushOverlay: { resourceId: "layout-settings" },
    });

    handleActionsDelete(deps, {
      _event: { detail: { actionType: "sectionTransition" } },
    });

    expect(state.values.click.payload.actions).toEqual({
      pushOverlay: { resourceId: "layout-settings" },
    });
    expect(state.actionsEditorActions).toEqual({
      pushOverlay: { resourceId: "layout-settings" },
    });
    expect(dispatchedEvents).toHaveLength(1);
  });

  it("leaves the interaction alone when the action is not there", () => {
    const { state, dispatchedEvents, deps } = createDeps({
      pushOverlay: { resourceId: "layout-settings" },
    });

    handleActionsDelete(deps, {
      _event: { detail: { actionType: "resetStoryAtSection" } },
    });

    expect(state.values.click.payload.actions).toEqual({
      pushOverlay: { resourceId: "layout-settings" },
    });
    expect(dispatchedEvents).toEqual([]);
  });
});
