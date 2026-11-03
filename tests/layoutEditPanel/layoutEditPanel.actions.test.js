import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
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
import { EN_I18N } from "../support/i18n.js";

const EMPTY_TREE = { items: {}, tree: [] };
const LAYOUT_EDIT_PANEL_CONSTANTS = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("layoutEditPanel Current Value", () => {
  it.each([
    ["slider", "change", true],
    ["sprite", "click", false],
    ["sprite", "rightClick", false],
    ["sprite", "scrollDown", false],
  ])(
    "offers Current Value for a %s's %s actions: %s",
    (itemType, interactionType, allowCurrentValue) => {
      const state = createInitialState();
      setValues({ state }, { values: { type: itemType, name: "Element One" } });
      setActiveInteractionType({ state }, { interactionType });

      const viewData = selectViewData({
        state,
        props: {
          itemType,
          layoutType: "general",
          resourceType: "layouts",
          layoutsData: EMPTY_TREE,
          charactersData: EMPTY_TREE,
          isInsideSaveLoadSlot: false,
          isInsideDirectedContainer: false,
        },
        constants: LAYOUT_EDIT_PANEL_CONSTANTS,
        i18n: EN_I18N,
      });

      expect(viewData.allowCurrentValue).toBe(allowCurrentValue);
    },
  );
});

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

  it("replaces the interaction's navigation action with a submitted one", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    setValues(
      { state },
      {
        values: {
          click: {
            payload: {
              actions: {
                sectionTransition: {
                  sceneId: "scene-1",
                  sectionId: "section-2",
                },
                pushOverlay: { resourceId: "layout-settings" },
              },
            },
          },
        },
      },
    );
    setActiveInteractionType({ state }, { interactionType: "click" });
    syncActionsEditorActions({ state }, { interactionType: "click" });

    handleActionsChange(
      {
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
      { _event: { detail: { nextLine: {} } } },
    );

    const expectedActions = {
      pushOverlay: { resourceId: "layout-settings" },
      nextLine: {},
    };
    expect(state.values.click.payload.actions).toEqual(expectedActions);
    expect(state.actionsEditorActions).toEqual(expectedActions);
    // The layout editor saves the actions the update carries.
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].detail.name).toBe("click.payload.actions");
    expect(dispatchedEvents[0].detail.value).toEqual(expectedActions);
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
