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
                pushLayeredView: {
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
      pushLayeredView: {
        resourceId: "layout-settings",
      },
      setMenuPage: {
        value: "options",
      },
    });
    expect(state.actionsEditorActions).toEqual({
      pushLayeredView: {
        resourceId: "layout-settings",
      },
      setMenuPage: {
        value: "options",
      },
    });
  });
});
