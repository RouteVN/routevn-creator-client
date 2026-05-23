import { describe, expect, it, vi } from "vitest";
import {
  handleCancelEditClick,
  handleChoiceContextMenu,
  handleChoiceFormChange,
  handleChoiceUpdateVariablesChange,
  handleChoiceUpdateVariablesDelete,
  handleDropdownMenuClickItem,
  handleSaveChoiceClick,
  handleSubmitClick,
} from "../../src/components/commandLineChoices/commandLineChoices.handlers.js";
import {
  createInitialState,
  hideDropdownMenu,
  removeChoice,
  saveChoice,
  selectDropdownMenuChoiceIndex,
  selectEditForm,
  selectItems,
  selectItemsWithEditingDraft,
  selectMode,
  selectSelectedResourceId,
  setEditingIndex,
  setItems,
  setMode,
  setSelectedResourceId,
  showDropdownMenu,
  updateEditForm,
} from "../../src/components/commandLineChoices/commandLineChoices.store.js";

const layouts = [
  {
    id: "choice-layout",
    name: "Choice Layout",
    layoutType: "choice",
  },
];

const createStoreApi = (state) => ({
  hideDropdownMenu: () => hideDropdownMenu({ state }),
  removeChoice: (payload) => removeChoice({ state }, payload),
  saveChoice: () => saveChoice({ state }),
  selectDropdownMenuChoiceIndex: () => selectDropdownMenuChoiceIndex({ state }),
  selectEditForm: () => selectEditForm({ state }),
  selectItems: () => selectItems({ state }),
  selectItemsWithEditingDraft: () => selectItemsWithEditingDraft({ state }),
  selectMode: () => selectMode({ state }),
  selectSelectedResourceId: () => selectSelectedResourceId({ state }),
  setEditingIndex: (payload) => setEditingIndex({ state }, payload),
  setMode: (payload) => setMode({ state }, payload),
  setSelectedResourceId: (payload) => setSelectedResourceId({ state }, payload),
  showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
  updateEditForm: (payload) => updateEditForm({ state }, payload),
});

const setExistingChoice = (state) => {
  setItems(
    { state },
    {
      items: [
        {
          content: "Stay",
          events: {
            click: {
              actions: {
                nextLine: {},
              },
            },
          },
        },
      ],
    },
  );
  setSelectedResourceId(
    { state },
    {
      resourceId: "choice-layout",
    },
  );
};

describe("commandLineChoices.handlers", () => {
  it("emits temporary presentation state while editing a choice", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setExistingChoice(state);
    setMode({ state }, { mode: "editChoice" });
    setEditingIndex({ state }, { index: 0 });

    handleChoiceFormChange(
      {
        store,
        render,
        dispatchEvent,
        props: {
          layouts,
        },
      },
      {
        _event: {
          detail: {
            name: "content",
            value: "Leave",
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        choice: {
          resourceId: "choice-layout",
          items: [
            {
              content: "Leave",
              events: {
                click: {
                  actions: {
                    nextLine: {},
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("updates the editing choice from nested update-variable actions", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);
    const stopPropagation = vi.fn();
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

    setExistingChoice(state);
    setMode({ state }, { mode: "editChoice" });
    setEditingIndex({ state }, { index: 0 });

    const deps = {
      store,
      render,
      dispatchEvent,
      props: {
        layouts,
      },
    };

    handleChoiceUpdateVariablesChange(deps, {
      _event: {
        stopPropagation,
        detail: {
          updateVariable,
        },
      },
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(selectEditForm({ state }).updateVariable).toEqual(updateVariable);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        choice: {
          resourceId: "choice-layout",
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
      },
    });

    dispatchEvent.mockClear();

    handleChoiceUpdateVariablesDelete(deps, {
      _event: {
        stopPropagation,
        detail: {
          actionType: "updateVariable",
        },
      },
    });

    expect(selectEditForm({ state }).updateVariable).toBeUndefined();
    expect(
      dispatchEvent.mock.calls[0][0].detail.presentationState.choice,
    ).toEqual({
      resourceId: "choice-layout",
      items: [
        {
          content: "Stay",
          events: {
            click: {
              actions: {
                nextLine: {},
              },
            },
          },
        },
      ],
    });
  });

  it("emits saved choice state after cancelling an edit draft", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setExistingChoice(state);
    setMode({ state }, { mode: "editChoice" });
    setEditingIndex({ state }, { index: 0 });
    updateEditForm(
      { state },
      {
        field: "content",
        value: "Draft",
      },
    );

    handleCancelEditClick({
      store,
      render,
      dispatchEvent,
      props: {
        layouts,
      },
    });

    expect(selectMode({ state })).toBe("list");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        choice: {
          resourceId: "choice-layout",
          items: [
            {
              content: "Stay",
              events: {
                click: {
                  actions: {
                    nextLine: {},
                  },
                },
              },
            },
          ],
        },
      },
    });
  });

  it("emits temporary presentation state after saving a choice", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setExistingChoice(state);
    setMode({ state }, { mode: "editChoice" });
    setEditingIndex({ state }, { index: 0 });
    updateEditForm(
      { state },
      {
        field: "content",
        value: "Leave",
      },
    );

    handleSaveChoiceClick({
      store,
      render,
      dispatchEvent,
      appService: {
        showAlert: vi.fn(),
      },
      props: {
        layouts,
      },
    });

    expect(selectItems({ state })[0].content).toBe("Leave");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(
      dispatchEvent.mock.calls[0][0].detail.presentationState.choice,
    ).toEqual({
      resourceId: "choice-layout",
      items: [
        {
          content: "Leave",
          events: {
            click: {
              actions: {
                nextLine: {},
              },
            },
          },
        },
      ],
    });
  });

  it("saves a choice section transition with an optional screen animation", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

    setItems({ state }, { items: [] });
    setSelectedResourceId(
      { state },
      {
        resourceId: "choice-layout",
      },
    );
    setMode({ state }, { mode: "editChoice" });
    setEditingIndex({ state }, { index: -1 });
    updateEditForm(
      { state },
      {
        field: "content",
        value: "Leave",
      },
    );
    updateEditForm(
      { state },
      {
        field: "actionType",
        value: "sectionTransition",
      },
    );
    updateEditForm(
      { state },
      {
        field: "sceneId",
        value: "scene-1",
      },
    );
    updateEditForm(
      { state },
      {
        field: "sectionId",
        value: "section-2",
      },
    );
    updateEditForm(
      { state },
      {
        field: "transitionAnimationId",
        value: "screen-crossfade",
      },
    );

    handleSaveChoiceClick({
      store,
      render,
      dispatchEvent,
      appService: {
        showAlert: vi.fn(),
      },
      props: {
        layouts,
      },
    });

    expect(selectItems({ state })[0]).toEqual({
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
    });
    expect(
      dispatchEvent.mock.calls[0][0].detail.presentationState.choice.items[0],
    ).toEqual(selectItems({ state })[0]);
  });

  it("submits the saved choice state with the selected layout", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setExistingChoice(state);

    handleSubmitClick({
      dispatchEvent,
      store: createStoreApi(state),
      appService: {
        showAlert: vi.fn(),
      },
      props: {
        layouts,
      },
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      choice: {
        resourceId: "choice-layout",
        items: [
          {
            content: "Stay",
            events: {
              click: {
                actions: {
                  nextLine: {},
                },
              },
            },
          },
        ],
      },
    });
  });

  it("deletes the right-clicked choice after a bubbled container context menu event", () => {
    const state = createInitialState();
    const render = vi.fn();
    const dispatchEvent = vi.fn();
    const store = createStoreApi(state);

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
    setSelectedResourceId(
      { state },
      {
        resourceId: "choice-layout",
      },
    );

    const deps = {
      store,
      render,
      dispatchEvent,
      props: {
        layouts,
      },
    };

    handleChoiceContextMenu(deps, {
      _event: {
        preventDefault: vi.fn(),
        currentTarget: {
          dataset: {
            index: "2",
          },
          getAttribute: vi.fn(),
        },
        clientX: 40,
        clientY: 80,
      },
    });
    handleChoiceContextMenu(deps, {
      _event: {
        preventDefault: vi.fn(),
        currentTarget: {
          dataset: {},
          getAttribute: vi.fn(() => null),
        },
        clientX: 40,
        clientY: 80,
      },
    });

    expect(selectDropdownMenuChoiceIndex({ state })).toBe(2);

    handleDropdownMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "delete",
          },
        },
      },
    });

    expect(selectItems({ state }).map((item) => item.content)).toEqual([
      "Stay",
      "Leave",
    ]);
    expect(dispatchEvent.mock.calls.at(-1)[0].detail).toEqual({
      presentationState: {
        choice: {
          resourceId: "choice-layout",
          items: [{ content: "Stay" }, { content: "Leave" }],
        },
      },
    });
  });
});
