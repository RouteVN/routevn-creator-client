import { describe, expect, it, vi } from "vitest";
import {
  createDefaultBranchDraft,
  createInitialState,
  resetTempBranch,
  selectBranches,
  selectDefaultBranch,
  setBranches,
  setCurrentBranchId,
  setMode,
  setTempBranch,
  setVariablesData,
  updateBranch,
} from "../../src/components/commandLineConditional/commandLineConditional.store.js";
import {
  handleAddDefaultClick,
  handleBranchClick,
  handleEnumValueSelectChange,
  handleSaveBranchClick,
  handleSubmitClick,
  handleVariableSelectChange,
} from "../../src/components/commandLineConditional/commandLineConditional.handlers.js";

const createStore = (state) => ({
  createDefaultBranchDraft: (payload) =>
    createDefaultBranchDraft({ state }, payload),
  getState: () => state,
  resetTempBranch: (payload) => resetTempBranch({ state }, payload),
  selectBranches: () => selectBranches({ state }),
  selectDefaultBranch: () => selectDefaultBranch({ state }),
  setCurrentBranchId: (payload) => setCurrentBranchId({ state }, payload),
  setMode: (payload) => setMode({ state }, payload),
  setTempBranch: (payload) => setTempBranch({ state }, payload),
  updateBranch: (payload) => updateBranch({ state }, payload),
});

describe("commandLineConditional.handlers", () => {
  it("submits variable branches using the route engine conditional shape", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            trust: {
              id: "trust",
              name: "Trust",
              type: "variable",
              variableType: "number",
            },
          },
          tree: [{ id: "trust" }],
        },
      },
    );
    setTempBranch(
      { state },
      {
        conditionKind: "variable",
        variableId: "trust",
        op: "eq",
        value: "70",
        actions: {
          nextLine: {},
        },
      },
    );

    handleSaveBranchClick(
      {
        appService,
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );
    handleSubmitClick(
      {
        appService,
        store: createStore(state),
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].detail).toEqual({
      conditional: {
        branches: [
          {
            when: {
              eq: [{ var: "variables.trust" }, 70],
            },
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    });
  });

  it("submits a default branch without a condition", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };
    const store = createStore(state);

    handleAddDefaultClick(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );
    setTempBranch(
      { state },
      {
        actions: {
          nextLine: {},
        },
      },
    );
    handleSaveBranchClick(
      {
        appService,
        store,
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );
    handleSubmitClick(
      {
        appService,
        store,
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(dispatchedEvents[0].detail).toEqual({
      conditional: {
        branches: [
          {
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    });
  });

  it("preserves unsupported branch conditions when editing branch actions", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };
    const store = createStore(state);
    const unsupportedWhen = {
      gt: [{ var: "variables.trust" }, 70],
    };

    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-unsupported",
            when: unsupportedWhen,
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    );

    handleBranchClick(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              branchId: "branch-unsupported",
            },
          },
        },
      },
    );
    setTempBranch(
      { state },
      {
        actions: {
          updateVariable: {
            variableId: "trust",
            value: 80,
          },
        },
      },
    );
    handleSaveBranchClick(
      {
        appService,
        store,
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );
    handleSubmitClick(
      {
        appService,
        store,
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(dispatchedEvents[0].detail).toEqual({
      conditional: {
        branches: [
          {
            when: unsupportedWhen,
            actions: {
              updateVariable: {
                variableId: "trust",
                value: 80,
              },
            },
          },
        ],
      },
    });
  });

  it("submits enum branches using a selected enum value", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };
    const store = createStore(state);

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              name: "Mood",
              type: "variable",
              variableType: "string",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [{ id: "mood" }],
        },
      },
    );

    handleVariableSelectChange(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          detail: { value: "mood" },
        },
      },
    );
    handleEnumValueSelectChange(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          detail: { value: "sad" },
        },
      },
    );
    setTempBranch(
      { state },
      {
        actions: {
          nextLine: {},
        },
      },
    );

    handleSaveBranchClick(
      {
        appService,
        store,
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );
    handleSubmitClick(
      {
        appService,
        store,
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(dispatchedEvents[0].detail).toEqual({
      conditional: {
        branches: [
          {
            when: {
              eq: [{ var: "variables.mood" }, "sad"],
            },
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    });
  });

  it("rejects unsupported operators", () => {
    const state = createInitialState();
    const appService = {
      showAlert: vi.fn(),
    };

    setTempBranch(
      { state },
      {
        conditionKind: "variable",
        variableId: "trust",
        op: "gte",
        value: "70",
        actions: {
          nextLine: {},
        },
      },
    );

    handleSaveBranchClick(
      {
        appService,
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "Condition operator is unsupported.",
      title: "Warning",
    });
    expect(state.branches).toEqual([]);
  });

  it("rejects default branches before the final branch", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };

    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-1",
            actions: {
              nextLine: {},
            },
          },
          {
            id: "branch-2",
            when: {
              eq: [{ var: "variables.trust" }, 70],
            },
            actions: {
              sectionTransition: {
                sceneId: "scene-2",
                sectionId: "section-2",
              },
            },
          },
        ],
      },
    );

    handleSubmitClick(
      {
        appService,
        store: createStore(state),
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "The default branch must be the last branch.",
      title: "Warning",
    });
    expect(dispatchedEvents).toEqual([]);
  });
});
