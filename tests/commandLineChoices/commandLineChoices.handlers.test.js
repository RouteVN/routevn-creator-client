import { describe, expect, it, vi } from "vitest";
import {
  handleCancelEditClick,
  handleChoiceFormChange,
  handleSaveChoiceClick,
  handleSubmitClick,
} from "../../src/components/commandLineChoices/commandLineChoices.handlers.js";
import {
  createInitialState,
  saveChoice,
  selectEditForm,
  selectItems,
  selectItemsWithEditingDraft,
  selectMode,
  selectSelectedResourceId,
  setEditingIndex,
  setItems,
  setMode,
  setSelectedResourceId,
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
  saveChoice: () => saveChoice({ state }),
  selectEditForm: () => selectEditForm({ state }),
  selectItems: () => selectItems({ state }),
  selectItemsWithEditingDraft: () => selectItemsWithEditingDraft({ state }),
  selectMode: () => selectMode({ state }),
  selectSelectedResourceId: () => selectSelectedResourceId({ state }),
  setEditingIndex: (payload) => setEditingIndex({ state }, payload),
  setMode: (payload) => setMode({ state }, payload),
  setSelectedResourceId: (payload) => setSelectedResourceId({ state }, payload),
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
});
