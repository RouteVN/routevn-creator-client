import { describe, expect, it } from "vitest";
import {
  addChoice,
  createInitialState,
  selectEditForm,
  selectItems,
  saveChoice,
  selectViewData,
  setAnimations,
  setEditingIndex,
  setItems,
  setScenes,
  showDropdownMenu,
  updateEditForm,
} from "../../src/components/commandLineChoices/commandLineChoices.store.js";

describe("commandLineChoices.store", () => {
  it("uses nextLine events for default and added choices", () => {
    const state = createInitialState();

    expect(selectItems({ state })).toEqual([
      {
        content: "Choice 1",
        events: {
          click: {
            actions: {
              nextLine: {},
            },
          },
        },
      },
      {
        content: "Choice 2",
        events: {
          click: {
            actions: {
              nextLine: {},
            },
          },
        },
      },
    ]);

    addChoice({ state });

    expect(selectItems({ state })[2]).toEqual({
      content: "Choice 3",
      events: {
        click: {
          actions: {
            nextLine: {},
          },
        },
      },
    });
  });

  it("prefills and offers screen animations for choice section transitions", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        items: [
          {
            content: "Leave",
            events: {
              click: {
                actions: {
                  sectionTransition: {
                    sceneId: "scene-1",
                    sectionId: "section-2",
                    screen: {
                      animations: {
                        resourceId: "screen-crossfade",
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    );
    setScenes(
      { state },
      {
        scenes: {
          items: {
            "scene-1": {
              id: "scene-1",
              type: "scene",
              name: "Opening",
              sections: {
                items: {
                  "section-2": {
                    id: "section-2",
                    type: "section",
                    name: "Exit",
                  },
                },
                tree: [{ id: "section-2" }],
              },
            },
          },
          tree: [{ id: "scene-1" }],
        },
      },
    );
    setAnimations(
      { state },
      {
        animations: {
          items: {
            "screen-crossfade": {
              id: "screen-crossfade",
              type: "animation",
              name: "Screen Crossfade",
              animation: {
                type: "transition",
              },
            },
            "pulse-update": {
              id: "pulse-update",
              type: "animation",
              name: "Pulse",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "screen-crossfade" }, { id: "pulse-update" }],
        },
      },
    );

    setEditingIndex({ state }, { index: 0 });

    const viewData = selectViewData({ state, props: { layouts: [] } });

    expect(selectEditForm({ state }).transitionAnimationId).toBe(
      "screen-crossfade",
    );
    expect(viewData.editFormContext.transitionAnimationOptions).toEqual([
      {
        value: "screen-crossfade",
        label: "Screen Crossfade",
      },
    ]);
  });

  it("hides unavailable move actions in the choice context menu", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        items: [
          { content: "Stay" },
          { content: "Leave" },
          { content: "Return" },
        ],
      },
    );

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        choiceIndex: 0,
      },
    );

    expect(
      selectViewData({ state, props: { layouts: [] } }).dropdownMenu.items,
    ).toEqual([
      { label: "Move Down", type: "item", value: "moveDown" },
      { label: "Delete", type: "item", value: "delete" },
    ]);

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        choiceIndex: 1,
      },
    );

    expect(
      selectViewData({ state, props: { layouts: [] } }).dropdownMenu.items,
    ).toEqual([
      { label: "Move Up", type: "item", value: "moveUp" },
      { label: "Move Down", type: "item", value: "moveDown" },
      { label: "Delete", type: "item", value: "delete" },
    ]);

    showDropdownMenu(
      { state },
      {
        position: { x: 10, y: 20 },
        choiceIndex: 2,
      },
    );

    expect(
      selectViewData({ state, props: { layouts: [] } }).dropdownMenu.items,
    ).toEqual([
      { label: "Move Up", type: "item", value: "moveUp" },
      { label: "Delete", type: "item", value: "delete" },
    ]);
  });

  it("prefills and saves update-variable actions for a choice", () => {
    const state = createInitialState();
    const updateVariable = {
      id: "update-choice-vars",
      operations: [
        {
          variableId: "affection",
          op: "increment",
          value: 1,
        },
      ],
    };

    setItems(
      { state },
      {
        items: [
          {
            content: "Stay",
            events: {
              click: {
                actions: {
                  updateVariable,
                  nextLine: {},
                },
              },
            },
          },
        ],
      },
    );

    setEditingIndex({ state }, { index: 0 });

    const viewData = selectViewData({ state, props: { layouts: [] } });

    expect(selectEditForm({ state }).updateVariable).toEqual(updateVariable);
    expect(viewData.choiceUpdateVariableActions).toEqual({ updateVariable });

    updateEditForm(
      { state },
      {
        field: "content",
        value: "Leave",
      },
    );
    saveChoice({ state });

    expect(selectItems({ state })[0]).toEqual({
      content: "Leave",
      events: {
        click: {
          actions: {
            updateVariable,
            nextLine: {},
          },
        },
      },
    });
  });
});
