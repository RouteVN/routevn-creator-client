import { describe, expect, it } from "vitest";
import {
  createInitialState,
  setActionsEditorActions,
  setActiveInteractionType,
  setValues,
  syncActionsEditorActions,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { handleActionsChange } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";

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
});
